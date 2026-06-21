//! Checkers (standard 8x8 American checkers / English draughts).
//!
//! ## Board and coordinates
//!
//! Squares are indexed `0..=63` as `row * 8 + col`, row 0 is player 1's home rank (bottom),
//! row 7 is player 2's home rank (top). Pieces live ONLY on the dark squares, defined here as
//! the squares where `(row + col)` is odd. Player 1 ([`WINNER_P1`], the first mover, conventionally
//! the lighter pieces here) starts on rows 0..=2 and advances toward row 7. Player 2
//! ([`WINNER_P2`]) starts on rows 5..=7 and advances toward row 0.
//!
//! ## Move notation
//!
//! A move is a `-`-separated list of square indices: a simple step `"from-to"` (e.g. `"8-13"`),
//! or a multi-jump `"sq1-sq2-sq3-..."` where each consecutive pair is a single diagonal capture
//! over an enemy piece. All squares must be dark squares; every hop must be a legal diagonal.
//!
//! ## Rules enforced
//!
//! - Moves must be diagonal. A simple (non-capturing) move is exactly one diagonal step into an
//!   empty square. A capturing hop is exactly two diagonal steps over an adjacent ENEMY piece into
//!   an empty landing square; the jumped piece is removed.
//! - A man (non-king) may only move/capture FORWARD (player 1 toward higher rows, player 2 toward
//!   lower rows). A king may move/capture in all four diagonal directions.
//! - Reaching the far back rank (player 1 -> row 7, player 2 -> row 0) promotes the piece to a king.
//!   Promotion ends the move (standard rule: a man that reaches the back rank stops, even mid-jump).
//! - The mover always moves their OWN piece; the start square must hold a piece of the side to move.
//! - The game ends when the player about to move has no pieces left, or has no legal move at all
//!   (a "no_moves" loss). The mover who delivered that state wins.
//!
//! ## Custom starting positions (backward-compatible)
//!
//! [`CheckersGame::new`] is the standard 12v12 opening and is still the default. A second
//! constructor [`CheckersGame::from_setup`] takes a 65-byte position descriptor so that short
//! endgames (and thus BOARD wins by capture or by leaving the opponent with no legal move) are
//! reachable through [`crate::replay`]: pass [`crate::GameInput::setup`] (empty = use the default
//! opening). This makes a real board-win provable end to end, not only a resignation. The setup
//! descriptor is validated; a malformed one returns `Err` so it cannot smuggle in an illegal state.
//!
//! ## v1 SIMPLIFICATION (honesty note)
//!
//! In tournament checkers, captures are MANDATORY: if a capture is available you must take one (and
//! must continue a multi-jump until no further capture is possible). For v1 we DO NOT force captures:
//! a player may make any legal simple move even when a capture exists, and a multi-jump may stop
//! early as long as every hop encoded is itself a legal capture. This is a deliberate, documented
//! relaxation. Every move that IS made is still fully validated for legality (diagonal geometry,
//! correct ownership, real captures, forward-only for men, in-bounds, dark-square-only), so the
//! honesty gate holds: an illegal move still returns `Err` and no proof can be produced for it.
//! Tightening to forced-capture is a backward-compatible future change (it only REJECTS more moves).

use crate::{GameRules, WINNER_P1, WINNER_P2};

const BOARD: usize = 64;
const SIDE: i32 = 8;

/// A piece on the board.
#[derive(Clone, Copy, PartialEq, Eq)]
struct Piece {
    /// Owner: [`WINNER_P1`] (0) or [`WINNER_P2`] (1).
    owner: u8,
    /// Promoted to a king (may move in all four diagonal directions).
    king: bool,
}

/// Cell occupancy: `None` empty, `Some(piece)` occupied.
type Cell = Option<Piece>;

/// A live 8x8 checkers board plus the rules driver.
pub struct CheckersGame {
    /// `board[sq]` for `sq in 0..64`, `sq = row*8 + col`.
    board: [Cell; BOARD],
    /// Whose turn: [`WINNER_P1`] (0) or [`WINNER_P2`] (1).
    turn: u8,
}

/// `(row, col)` of a square index.
fn rc(sq: usize) -> (i32, i32) {
    ((sq / 8) as i32, (sq % 8) as i32)
}

/// Is `(row, col)` on the board?
fn in_bounds(row: i32, col: i32) -> bool {
    (0..SIDE).contains(&row) && (0..SIDE).contains(&col)
}

/// A dark (playable) square is one where `(row + col)` is odd.
fn is_dark(sq: usize) -> bool {
    let (r, c) = rc(sq);
    (r + c) % 2 != 0
}

impl CheckersGame {
    /// Standard starting position, player 1 to move.
    pub fn new() -> Self {
        let mut board: [Cell; BOARD] = [None; BOARD];
        // Player 1 on the three lowest ranks (rows 0..=2), player 2 on the three highest (rows 5..=7),
        // pieces only on dark squares.
        for sq in 0..BOARD {
            if !is_dark(sq) {
                continue;
            }
            let (row, _) = rc(sq);
            if (0..=2).contains(&row) {
                board[sq] = Some(Piece { owner: WINNER_P1, king: false });
            } else if (5..=7).contains(&row) {
                board[sq] = Some(Piece { owner: WINNER_P2, king: false });
            }
        }
        CheckersGame { board, turn: WINNER_P1 }
    }

    /// Build a game from a custom 65-byte position descriptor (backward-compatible).
    ///
    /// Layout: bytes `0..64` are the squares (`square = row*8 + col`), byte `64` is the side to
    /// move. Square encoding: `0` = empty, `1` = P1 man, `2` = P1 king, `3` = P2 man, `4` = P2 king.
    /// Side-to-move encoding: `0` = player 1, `1` = player 2.
    ///
    /// Validated: exact length 65, every code in range, no piece on a LIGHT square, and a legal
    /// side-to-move. An invalid descriptor returns `Err`, so a malformed setup cannot create an
    /// illegal board state that play would then "prove".
    ///
    /// An EMPTY `setup` is the caller's signal to use the default opening, handled by
    /// [`CheckersGame::from_setup`] before calling this.
    pub fn from_position(setup: &[u8]) -> Result<Self, String> {
        if setup.len() != 65 {
            return Err(format!(
                "checkers setup must be 65 bytes (64 squares + side-to-move), got {}",
                setup.len()
            ));
        }
        let mut board: [Cell; BOARD] = [None; BOARD];
        for (sq, &code) in setup[..64].iter().enumerate() {
            let piece = match code {
                0 => None,
                1 => Some(Piece { owner: WINNER_P1, king: false }),
                2 => Some(Piece { owner: WINNER_P1, king: true }),
                3 => Some(Piece { owner: WINNER_P2, king: false }),
                4 => Some(Piece { owner: WINNER_P2, king: true }),
                other => {
                    return Err(format!("invalid square code {other} at square {sq} (expected 0..=4)"));
                }
            };
            if piece.is_some() && !is_dark(sq) {
                return Err(format!("setup places a piece on light square {sq} (pieces are dark-only)"));
            }
            board[sq] = piece;
        }
        let turn = match setup[64] {
            0 => WINNER_P1,
            1 => WINNER_P2,
            other => return Err(format!("invalid side-to-move {other} in setup (expected 0 or 1)")),
        };
        Ok(CheckersGame { board, turn })
    }

    /// Construct from [`crate::GameInput::setup`]: an EMPTY slice yields the default opening
    /// ([`CheckersGame::new`]), otherwise the 65-byte custom position via [`CheckersGame::from_position`].
    /// This is the single entry point [`crate::replay`] uses, keeping the default 12v12 game intact.
    pub fn from_setup(setup: &[u8]) -> Result<Self, String> {
        if setup.is_empty() {
            Ok(Self::new())
        } else {
            Self::from_position(setup)
        }
    }

    fn opponent(side: u8) -> u8 {
        if side == WINNER_P1 {
            WINNER_P2
        } else {
            WINNER_P1
        }
    }

    /// The forward row direction for a side's MEN (player 1 goes up +1, player 2 goes down -1).
    fn forward(side: u8) -> i32 {
        if side == WINNER_P1 {
            1
        } else {
            -1
        }
    }

    /// The back rank a side promotes on (player 1 -> row 7, player 2 -> row 0).
    fn promotion_row(side: u8) -> i32 {
        if side == WINNER_P1 {
            7
        } else {
            0
        }
    }

    /// The four (or two, for a man) legal diagonal step directions for a piece.
    /// A king steps `(+/-1, +/-1)`; a man only steps forward in row.
    fn step_dirs(piece: Piece) -> Vec<(i32, i32)> {
        if piece.king {
            vec![(1, 1), (1, -1), (-1, 1), (-1, -1)]
        } else {
            let f = Self::forward(piece.owner);
            vec![(f, 1), (f, -1)]
        }
    }

    /// Does the side to move have ANY legal move (simple or single capture) from any of its pieces?
    /// Used only for the "no legal move -> loss" terminal check; it does not enforce mandatory capture.
    fn has_any_move(&self, side: u8) -> bool {
        for sq in 0..BOARD {
            let piece = match self.board[sq] {
                Some(p) if p.owner == side => p,
                _ => continue,
            };
            let (r, c) = rc(sq);
            for (dr, dc) in Self::step_dirs(piece) {
                // Simple step into an empty adjacent dark square.
                let (sr, sc) = (r + dr, c + dc);
                if in_bounds(sr, sc) {
                    let dest = (sr * SIDE + sc) as usize;
                    if self.board[dest].is_none() {
                        return true;
                    }
                }
                // Capture: jump an adjacent enemy into the empty square beyond.
                let (jr, jc) = (r + dr, c + dc); // jumped-over square
                let (lr, lc) = (r + 2 * dr, c + 2 * dc); // landing square
                if in_bounds(jr, jc) && in_bounds(lr, lc) {
                    let jumped = (jr * SIDE + jc) as usize;
                    let land = (lr * SIDE + lc) as usize;
                    let enemy = matches!(self.board[jumped], Some(p) if p.owner != side);
                    if enemy && self.board[land].is_none() {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Apply ONE hop from `from` to `to` for `side`, validating geometry and (for captures) that a
    /// real enemy piece is jumped. Returns `Ok(was_capture)`. The moving piece is taken from
    /// `from` and placed on `to`; any jumped piece is removed. Promotion is NOT handled here.
    ///
    /// `must_be_capture` forces capture geometry for non-first hops of a multi-jump (you cannot
    /// chain a simple step onto a jump).
    fn apply_hop(
        &mut self,
        from: usize,
        to: usize,
        side: u8,
        must_be_capture: bool,
    ) -> Result<bool, String> {
        if from >= BOARD || to >= BOARD {
            return Err(format!("square out of range: {from}-{to}"));
        }
        if !is_dark(from) || !is_dark(to) {
            return Err(format!("move must stay on dark squares ({from}-{to})"));
        }
        let piece = match self.board[from] {
            Some(p) => p,
            None => return Err(format!("no piece on source square {from}")),
        };
        if piece.owner != side {
            return Err(format!(
                "piece on {from} belongs to the other player, not the side to move"
            ));
        }
        if self.board[to].is_some() {
            return Err(format!("destination square {to} is occupied"));
        }

        let (fr, fc) = rc(from);
        let (tr, tc) = rc(to);
        let dr = tr - fr;
        let dc = tc - fc;

        // Must be a diagonal move of magnitude 1 (simple) or 2 (capture).
        if dr.abs() != dc.abs() || (dr.abs() != 1 && dr.abs() != 2) {
            return Err(format!(
                "move {from}-{to} is not a single diagonal step or jump"
            ));
        }

        // A man may only move in its forward row direction.
        if !piece.king {
            let f = Self::forward(side);
            if dr.signum() != f {
                return Err(format!(
                    "a man on {from} cannot move backward; it advances row direction {f}"
                ));
            }
        }

        let is_capture = dr.abs() == 2;
        if must_be_capture && !is_capture {
            return Err(format!(
                "continuation hop {from}-{to} must be a capture, not a simple step"
            ));
        }

        if is_capture {
            // The jumped square is the midpoint; it must hold an enemy piece.
            let mr = fr + dr / 2;
            let mc = fc + dc / 2;
            let mid = (mr * SIDE + mc) as usize;
            match self.board[mid] {
                Some(p) if p.owner != side => {
                    self.board[mid] = None; // captured
                }
                Some(_) => {
                    return Err(format!(
                        "jump {from}-{to} does not pass over an enemy piece (own piece on {mid})"
                    ));
                }
                None => {
                    return Err(format!(
                        "jump {from}-{to} does not pass over any piece (square {mid} empty)"
                    ));
                }
            }
        }

        // Move the piece.
        self.board[from] = None;
        self.board[to] = Some(piece);
        Ok(is_capture)
    }

    /// After a move lands on `to`, promote to king if it reached the side's back rank.
    /// Returns `true` if a promotion happened (which ends a multi-jump per the standard rule).
    fn maybe_promote(&mut self, to: usize, side: u8) -> bool {
        let (tr, _) = rc(to);
        if tr == Self::promotion_row(side) {
            if let Some(p) = self.board[to].as_mut() {
                if !p.king {
                    p.king = true;
                    return true;
                }
            }
        }
        false
    }
}

impl Default for CheckersGame {
    fn default() -> Self {
        Self::new()
    }
}

impl GameRules for CheckersGame {
    fn side_to_move(&self) -> u8 {
        self.turn
    }

    fn step(&mut self, mv: &str) -> Result<Option<u8>, String> {
        let side = self.turn;

        // Parse the `-`-separated square list. Need at least a from and a to.
        let squares: Result<Vec<usize>, String> = mv
            .split('-')
            .map(|tok| {
                tok.trim()
                    .parse::<usize>()
                    .map_err(|_| format!("move square \"{tok}\" is not a number 0..63"))
            })
            .collect();
        let squares = squares?;
        if squares.len() < 2 {
            return Err(format!(
                "checkers move must be \"from-to\" (or a multi-jump), got \"{mv}\""
            ));
        }

        // Walk each consecutive hop. A multi-hop (3+ squares) must be all captures.
        let multi = squares.len() > 2;
        for (i, win) in squares.windows(2).enumerate() {
            let from = win[0];
            let to = win[1];
            // Hops after the first in a chain must be captures; a 2-square move may be either.
            let must_capture = multi || i > 0;
            let was_capture = self.apply_hop(from, to, side, must_capture)?;

            if multi && !was_capture {
                // Defensive: apply_hop already enforces this, but keep the invariant explicit.
                return Err(format!("multi-jump hop {from}-{to} was not a capture"));
            }

            // Promotion stops the move; a further hop in the chain would be illegal.
            let promoted = self.maybe_promote(to, side);
            if promoted && i + 1 < squares.len() - 1 {
                return Err(format!(
                    "piece promoted on {to} mid-jump; the move cannot continue after kinging"
                ));
            }
        }

        // Hand the turn to the opponent.
        let opponent = Self::opponent(side);
        self.turn = opponent;

        // Terminal check: if the opponent now has no pieces or no legal move, the mover wins.
        let opp_has_piece = self.board.iter().any(|c| matches!(c, Some(p) if p.owner == opponent));
        if !opp_has_piece || !self.has_any_move(opponent) {
            return Ok(Some(side));
        }

        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{replay, GameInput, GameType, WINNER_P1, WINNER_P2};

    fn game(moves: &[&str]) -> GameInput {
        game_with_setup(moves, vec![])
    }

    /// Build a checkers GameInput with an optional custom 65-byte setup (empty = default opening).
    fn game_with_setup(moves: &[&str], setup: Vec<u8>) -> GameInput {
        let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
        let n = moves.len();
        GameInput {
            game_type: GameType::Checkers,
            moves,
            elapsed_ms: vec![0u64; n],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: [[1u8; 32], [2u8; 32]],
            stake_sompi: 5_000,
            covenant_id: [7u8; 32],
            deck: vec![],
            deck_commitment: [0u8; 32],
            setup,
        }
    }

    /// Build a 65-byte setup descriptor from (square, code) pairs and a side-to-move.
    /// code: 1=P1 man, 2=P1 king, 3=P2 man, 4=P2 king.
    fn setup_bytes(pieces: &[(usize, u8)], side_to_move: u8) -> Vec<u8> {
        let mut s = vec![0u8; 65];
        for &(sq, code) in pieces {
            s[sq] = code;
        }
        s[64] = side_to_move;
        s
    }

    // ---- starting position sanity ----

    /// Dark-square classifier matches the standard setup count: 12 pieces per side.
    #[test]
    fn starting_position_has_12_per_side() {
        let g = CheckersGame::new();
        let p1 = g.board.iter().filter(|c| matches!(c, Some(p) if p.owner == WINNER_P1)).count();
        let p2 = g.board.iter().filter(|c| matches!(c, Some(p) if p.owner == WINNER_P2)).count();
        assert_eq!(p1, 12);
        assert_eq!(p2, 12);
    }

    /// A legal simple opening step for each side, game continues (Ok(None)).
    #[test]
    fn simple_opening_steps_are_legal() {
        // P1 man on row 2 dark squares can step forward to an empty row-3 dark square.
        // Square 17 (row 2, col 1) -> 24 (row 3, col 0): dr=+1, dc=-1, forward for p1.
        // Then P2 man on row 5 steps down: 40 (row 5,col 0) -> 33 (row 4, col 1): dr=-1, dc=+1.
        let mut g = CheckersGame::new();
        assert_eq!(g.step("17-24").unwrap(), None);
        assert_eq!(g.step("40-33").unwrap(), None);
    }

    // ---- custom-setup endgame reachable through replay ----

    /// BOARD WIN through replay: a hand-built endgame where P1's lone man jumps P2's lone man,
    /// after which P2 has no pieces -> P1 wins by capture (reason "no_moves"), num_plies = 1.
    /// This is the case the custom-start constructor exists to make provable (previously only a
    /// resignation could end a replay, because replay always started from the 12v12 opening).
    #[test]
    fn replay_board_win_by_capture_from_custom_setup() {
        // P1 man on 17 (row2,col1), P2 man on 26 (row3,col2). P1 jumps 17->35 over 26.
        let setup = setup_bytes(&[(17, 1), (26, 3)], WINNER_P1);
        let input = game_with_setup(&["17-35"], setup);
        let r = replay(&input).expect("legal capture-to-win from the custom endgame");
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "no_moves");
        assert_eq!(r.num_plies, 1);
    }

    /// BOARD WIN by leaving the opponent with no legal move (not a capture).
    /// P1 king on 35, P2 man on 56 (its own back rank, row7 col0) cornered with no forward move.
    /// Actually we engineer: P2 man on 1 (row0,col1) is on P2's promotion-direction-back; a P2 man
    /// at row 0 has nowhere DOWN to go (already at the lowest row) -> after P1 moves, if P2 has no
    /// move, P1 wins. We place P1 king on 12 stepping to 5 to confirm P1 can move while P2 is stuck.
    #[test]
    fn replay_board_win_by_no_moves_from_custom_setup() {
        // P2 man on square 1 = (row0,col1). A P2 man moves toward row 0 (down), but it is already at
        // row 0, so it has NO forward move and (as a man) cannot go up -> P2 is immobile.
        // P1 king on 21 = (2,5) steps to 14 = (1,6): dr=-1,dc=+1, legal for a king, lands empty.
        // After P1's move it is P2's turn; P2 has a piece but no legal move -> P1 wins.
        let setup = setup_bytes(&[(21, 2), (1, 3)], WINNER_P1);
        let input = game_with_setup(&["21-14"], setup);
        let r = replay(&input).expect("legal king step that strands P2");
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "no_moves");
        assert_eq!(r.num_plies, 1);
    }

    /// The custom-setup constructor validates: a piece on a LIGHT square is rejected.
    #[test]
    fn setup_on_light_square_is_err() {
        // Square 0 = (0,0) is light (0+0 even). Placing a piece there must fail.
        let setup = setup_bytes(&[(0, 1)], WINNER_P1);
        let input = game_with_setup(&["0-9"], setup);
        let err = replay(&input).unwrap_err();
        assert!(err.contains("light square"), "got: {err}");
    }

    /// The custom-setup constructor validates length / codes.
    #[test]
    fn setup_bad_length_is_err() {
        let input = game_with_setup(&["17-35"], vec![0u8; 10]); // wrong length
        let err = replay(&input).unwrap_err();
        assert!(err.contains("65 bytes"), "got: {err}");
    }

    /// An empty setup still uses the default 12v12 opening (backward compatibility).
    #[test]
    fn empty_setup_uses_default_opening() {
        let g = CheckersGame::from_setup(&[]).expect("empty setup -> default opening");
        let p1 = g.board.iter().filter(|c| matches!(c, Some(p) if p.owner == WINNER_P1)).count();
        assert_eq!(p1, 12);
    }

    // ---- capture sequence ending in a win ----
    //
    // NOTE on coordinates: dark (playable) squares are those where (row + col) is ODD.
    // Every square used below is verified dark, e.g. 17=(2,1), 26=(3,2), 35=(4,3) are all odd.

    /// Hand-build a tiny endgame: a single P1 man jumps the lone P2 man. After the capture P2 has
    /// no pieces left, so P1 (the mover) wins immediately with `Ok(Some(WINNER_P1))`.
    #[test]
    fn single_capture_removes_last_enemy_and_wins() {
        let mut g = CheckersGame::new();
        g.board = [None; BOARD];
        // P1 man on 17 (row 2, col 1). P2 man diagonally ahead on 26 (row 3, col 2).
        // P1 jumps 17 -> 35 (row 4, col 3) over 26, capturing P2's only piece.
        g.board[17] = Some(Piece { owner: WINNER_P1, king: false });
        g.board[26] = Some(Piece { owner: WINNER_P2, king: false });
        g.turn = WINNER_P1;
        let out = g.step("17-35").expect("the jump is legal");
        assert_eq!(out, Some(WINNER_P1));
        assert!(g.board[26].is_none(), "jumped piece must be removed");
        assert_eq!(g.board[35].map(|p| p.owner), Some(WINNER_P1));
    }

    /// A multi-jump (double capture) that wipes out both enemy pieces and wins.
    /// Path 1 -> 19 -> 37: 1=(0,1), 19=(2,3), 37=(4,5); jumped 10=(1,2) and 28=(3,4) (all dark).
    #[test]
    fn multi_jump_double_capture_wins() {
        let mut g = CheckersGame::new();
        g.board = [None; BOARD];
        g.board[1] = Some(Piece { owner: WINNER_P1, king: false });
        g.board[10] = Some(Piece { owner: WINNER_P2, king: false });
        g.board[28] = Some(Piece { owner: WINNER_P2, king: false });
        g.turn = WINNER_P1;
        let out = g.step("1-19-37").expect("double jump is legal");
        assert_eq!(out, Some(WINNER_P1));
        assert!(g.board[10].is_none() && g.board[28].is_none(), "both jumped removed");
        assert_eq!(g.board[37].map(|p| p.owner), Some(WINNER_P1));
    }

    /// Promotion: a P1 man reaching its back rank (row 7) becomes a king.
    /// 49=(6,1) -> 56=(7,0): forward step (dr=+1, dc=-1) onto a dark back-rank square. A P2 man on
    /// 42=(5,2) keeps the game alive so we can inspect the promotion.
    #[test]
    fn man_promotes_on_back_rank() {
        let mut g = CheckersGame::new();
        g.board = [None; BOARD];
        g.board[49] = Some(Piece { owner: WINNER_P1, king: false });
        g.board[42] = Some(Piece { owner: WINNER_P2, king: false }); // p2 has a move available
        g.turn = WINNER_P1;
        let out = g.step("49-56").expect("step to back rank is legal");
        assert_eq!(out, None, "game continues, p2 still has a move");
        assert_eq!(g.board[56].map(|p| p.king), Some(true), "must be kinged");
    }

    /// A king may move backward (a man may not).
    /// King on 35=(4,3) steps back to 26=(3,2): dr=-1 (backward for P1), dc=-1.
    #[test]
    fn king_can_move_backward() {
        let mut g = CheckersGame::new();
        g.board = [None; BOARD];
        g.board[35] = Some(Piece { owner: WINNER_P1, king: true });
        g.board[42] = Some(Piece { owner: WINNER_P2, king: false });
        g.turn = WINNER_P1;
        assert_eq!(g.step("35-26").unwrap(), None);
    }

    // ---- negative tests (the honesty gate) ----

    /// NEGATIVE: a man cannot move backward (only a king may).
    #[test]
    fn man_backward_move_is_err() {
        let mut g = CheckersGame::new();
        g.board = [None; BOARD];
        g.board[35] = Some(Piece { owner: WINNER_P1, king: false }); // a MAN, not a king
        g.board[42] = Some(Piece { owner: WINNER_P2, king: false });
        g.turn = WINNER_P1;
        // 35=(4,3) -> 26=(3,2) is backward for a P1 man -> illegal.
        let err = g.step("35-26").unwrap_err();
        assert!(err.contains("backward"), "got: {err}");
    }

    /// NEGATIVE: a non-diagonal "move" (same row, two columns over) is illegal.
    /// 17=(2,1) -> 19=(2,3): both dark and 19 is empty here, but dr=0 so it is not a diagonal.
    #[test]
    fn non_diagonal_move_is_err() {
        let mut g = CheckersGame::new();
        g.board = [None; BOARD];
        g.board[17] = Some(Piece { owner: WINNER_P1, king: false });
        g.board[42] = Some(Piece { owner: WINNER_P2, king: false });
        g.turn = WINNER_P1;
        let err = g.step("17-19").unwrap_err();
        assert!(err.contains("diagonal"), "got: {err}");
    }

    /// NEGATIVE: moving onto an occupied square is illegal.
    /// 1=(0,1) forward diagonal to 10=(1,2), which holds a P1 man at the start.
    #[test]
    fn move_onto_occupied_is_err() {
        let mut g = CheckersGame::new();
        let err = g.step("1-10").unwrap_err();
        assert!(err.contains("occupied"), "got: {err}");
    }

    /// NEGATIVE: a move from an empty square is illegal.
    /// 26=(3,2) is empty at the start; stepping it forward to 35 has no piece to move.
    #[test]
    fn move_from_empty_is_err() {
        let mut g = CheckersGame::new();
        let err = g.step("26-35").unwrap_err();
        assert!(err.contains("no piece"), "got: {err}");
    }

    /// NEGATIVE: moving the opponent's piece is illegal.
    /// It is P1's turn but 40=(5,0) holds a P2 man; 40 -> 33=(4,1) tries to move it.
    #[test]
    fn move_opponents_piece_is_err() {
        let mut g = CheckersGame::new();
        let err = g.step("40-33").unwrap_err();
        assert!(err.contains("other player"), "got: {err}");
    }

    /// NEGATIVE: a "jump" over an empty square (no piece to capture) is illegal.
    /// 17=(2,1) -> 35=(4,3) is jump geometry, but the midpoint 26=(3,2) is empty.
    #[test]
    fn empty_jump_is_err() {
        let mut g = CheckersGame::new();
        g.board = [None; BOARD];
        g.board[17] = Some(Piece { owner: WINNER_P1, king: false });
        g.board[42] = Some(Piece { owner: WINNER_P2, king: false });
        g.turn = WINNER_P1;
        let err = g.step("17-35").unwrap_err();
        assert!(err.contains("does not pass over any piece"), "got: {err}");
    }

    /// NEGATIVE: a "jump" over your OWN piece is illegal.
    /// 17 -> 35 over 26, but 26 holds a P1 (own) piece.
    #[test]
    fn jump_over_own_piece_is_err() {
        let mut g = CheckersGame::new();
        g.board = [None; BOARD];
        g.board[17] = Some(Piece { owner: WINNER_P1, king: false });
        g.board[26] = Some(Piece { owner: WINNER_P1, king: false }); // own piece in the way
        g.board[42] = Some(Piece { owner: WINNER_P2, king: false });
        g.turn = WINNER_P1;
        let err = g.step("17-35").unwrap_err();
        assert!(err.contains("own piece"), "got: {err}");
    }

    /// NEGATIVE: a move that strays onto a light (non-playable) square is illegal.
    /// 17=(2,1) -> 18=(2,2): 18 is a light square (2+2 even).
    #[test]
    fn move_to_light_square_is_err() {
        let mut g = CheckersGame::new();
        let err = g.step("17-18").unwrap_err();
        assert!(err.contains("dark squares"), "got: {err}");
    }

    /// NEGATIVE: unparseable / malformed moves are illegal.
    #[test]
    fn garbage_move_is_err() {
        let mut g = CheckersGame::new();
        assert!(g.step("e2e4").is_err());
        assert!(g.step("17").is_err()); // only one square, no destination
    }

    /// NEGATIVE: an off-board square index is illegal.
    /// 17 -> 64: 64 is past the last square (0..63).
    #[test]
    fn out_of_range_square_is_err() {
        let mut g = CheckersGame::new();
        assert!(g.step("17-64").is_err());
    }

    /// NEGATIVE: replay surfaces an illegal first move as Err (the proof gate). A non-diagonal
    /// opening move makes replay fail, so no proof could ever exist for that "game".
    #[test]
    fn replay_rejects_illegal_first_move() {
        let input = game(&["17-19"]); // same-row slide, not diagonal
        assert!(replay(&input).is_err());
    }

    /// End-to-end via `replay` from the standard start: two legal simple steps, then it is P1's
    /// turn again and P1 resigns -> P2 wins, reason "resign", three plies counted.
    /// (Capture-to-win endings are also covered via the custom-setup endgame above.)
    #[test]
    fn replay_runs_legal_opening_then_resign() {
        // Ply 0: P1 17-24 (dr+1,dc-1 forward). Ply 1: P2 40-33 (dr-1,dc+1 forward). Ply 2: P1 resigns.
        let input = game(&["17-24", "40-33", "resign"]);
        let r = replay(&input).expect("legal opening then resign");
        assert_eq!(r.winner, WINNER_P2);
        assert_eq!(r.reason, "resign");
        assert_eq!(r.num_plies, 3);
    }
}
