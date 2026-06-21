//! Chess rules via the `shakmaty` engine (same crate/version the backend uses).
//!
//! Moves are UCI strings like "e2e4", "e7e8q" (promotion). White is player 1 (side 0), black is
//! player 2 (side 1). Legality, check, checkmate, stalemate, insufficient material, castling, en
//! passant, and promotion are all enforced by shakmaty. An unparseable or illegal move yields
//! `Err`, which is exactly the honesty gate `replay` relies on.

use shakmaty::uci::UciMove;
use shakmaty::{Chess, Color, Outcome, Position};

use crate::{GameRules, WINNER_DRAW, WINNER_P1, WINNER_P2};

/// A live chess position plus the rules driver.
pub struct ChessGame {
    pos: Chess,
}

impl ChessGame {
    /// Standard starting position.
    pub fn new() -> Self {
        ChessGame {
            pos: Chess::default(),
        }
    }
}

impl Default for ChessGame {
    fn default() -> Self {
        Self::new()
    }
}

/// Map a shakmaty color to our universal side code. White = player 1 (0), Black = player 2 (1).
fn color_to_side(c: Color) -> u8 {
    c.fold_wb(WINNER_P1, WINNER_P2)
}

impl GameRules for ChessGame {
    fn side_to_move(&self) -> u8 {
        color_to_side(self.pos.turn())
    }

    fn step(&mut self, mv: &str) -> Result<Option<u8>, String> {
        // Parse UCI. Anything that is not well-formed UCI is rejected outright.
        let uci = UciMove::from_ascii(mv.as_bytes())
            .map_err(|_| format!("unparseable UCI move \"{mv}\""))?;
        // Resolve against THIS position; this rejects moves that are illegal here.
        let m = uci
            .to_move(&self.pos)
            .map_err(|_| format!("illegal move \"{mv}\" in this position"))?;
        // Belt-and-suspenders: `to_move` already validates, but re-check legality explicitly so
        // the honesty gate does not depend on a single API contract.
        if !self.pos.is_legal(&m) {
            return Err(format!("move \"{mv}\" is not legal in this position"));
        }

        self.pos.play_unchecked(&m);

        // Did this move end the game?
        match self.pos.outcome() {
            None => Ok(None),
            Some(Outcome::Decisive { winner }) => Ok(Some(color_to_side(winner))),
            Some(Outcome::Draw) => Ok(Some(WINNER_DRAW)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{replay, GameInput, GameType};

    fn ids() -> [[u8; 32]; 2] {
        [[1u8; 32], [2u8; 32]]
    }

    fn game(moves: &[&str], elapsed: &[u64], clock: u64, inc: u64) -> GameInput {
        GameInput {
            game_type: GameType::Chess,
            moves: moves.iter().map(|s| s.to_string()).collect(),
            elapsed_ms: elapsed.to_vec(),
            initial_clock_ms: clock,
            increment_ms: inc,
            players: ids(),
            stake_sompi: 5_000,
            covenant_id: [7u8; 32],
            deck: vec![],
            deck_commitment: [0u8; 32],
            setup: vec![],
            commitments: vec![],
        }
    }

    fn untimed(moves: &[&str]) -> GameInput {
        let elapsed = vec![0u64; moves.len()];
        game(moves, &elapsed, 0, 0)
    }

    /// Fool's mate: the fastest checkmate, BLACK delivers mate on move 2.
    /// 1. f3 e5 2. g4 Qh4# -> black (player 2) wins by checkmate.
    #[test]
    fn fools_mate_black_wins() {
        let input = untimed(&["f2f3", "e7e5", "g2g4", "d8h4"]);
        let r = replay(&input).expect("fool's mate is a legal forced checkmate");
        assert_eq!(r.winner, WINNER_P2, "black should win fool's mate");
        assert_eq!(r.reason, "checkmate");
        assert_eq!(r.num_plies, 4);
    }

    /// Scholar's mate: WHITE delivers mate on move 4.
    /// 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7# -> white (player 1) wins by checkmate.
    #[test]
    fn scholars_mate_white_wins() {
        let input = untimed(&[
            "e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7",
        ]);
        let r = replay(&input).expect("scholar's mate is a legal forced checkmate");
        assert_eq!(r.winner, WINNER_P1, "white should win scholar's mate");
        assert_eq!(r.reason, "checkmate");
        assert_eq!(r.num_plies, 7);
    }

    /// NEGATIVE: an illegal move (king teleport from e1 to e3 with pieces in the way / not a king
    /// move) must make replay return Err, so no proof could ever exist for it.
    #[test]
    fn illegal_move_is_err() {
        let input = untimed(&["e1e3"]);
        let err = replay(&input).unwrap_err();
        assert!(err.contains("illegal move"), "got: {err}");
    }

    /// NEGATIVE: garbage that is not even UCI must be rejected.
    #[test]
    fn unparseable_move_is_err() {
        let input = untimed(&["hello"]);
        assert!(replay(&input).is_err());
    }

    /// NEGATIVE: a move that is legal in general but not in THIS position (black moving first)
    /// must fail. After 1. e4, it is black's turn; asking white's e4-e5 again is illegal.
    #[test]
    fn wrong_side_move_is_err() {
        // After e2e4 it is black to move; e4e5 would be a white move -> illegal for black.
        let input = untimed(&["e2e4", "e4e5"]);
        assert!(replay(&input).is_err());
    }

    /// Clock: black blows the time budget on move 2. White moves fast, black thinks 6s with only
    /// 5s on the clock -> black loses on time, white (player 1) wins.
    #[test]
    fn timeout_loses_on_time() {
        // 5s clock, no increment. Ply 0 (white) uses 1s, ply 1 (black) uses 6s > 5s remaining.
        let input = game(&["e2e4", "e7e5"], &[1_000, 6_000], 5_000, 0);
        let r = replay(&input).expect("timeout is a valid terminal event");
        assert_eq!(r.winner, WINNER_P1, "white wins when black flags");
        assert_eq!(r.reason, "timeout");
        // The flagging move is not applied, so only the first ply counted.
        assert_eq!(r.num_plies, 1);
    }

    /// Clock: the increment must keep a player alive across a long move. Increment is added AFTER
    /// the time check, so the FIRST move's budget is just the base clock. We give a 5s base, then
    /// white spends 4.5s on ply 0 (clock 5000 - 4500 + 10000 = 10500). On ply 2 white spends 9s,
    /// which only survives because of the increment from ply 0. Without the increment white's
    /// remaining clock would be 500ms and ply 2 would flag; with it, white survives and the game
    /// ends when black resigns on ply 3.
    #[test]
    fn increment_prevents_timeout() {
        // Plies: 0 white e4 (4.5s), 1 black e5 (1s), 2 white g4 (9s, only OK due to increment),
        //        3 black resign.
        let input = game(
            &["e2e4", "e7e5", "g2g4", "resign"],
            &[4_500, 1_000, 9_000, 0],
            5_000,
            10_000,
        );
        let r = replay(&input).expect("no timeout because the increment kept white alive");
        // Black resigns on ply 3 -> white (player 1) wins.
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "resign");
    }

    /// Mirror control: WITHOUT the increment the same long ply-2 move flags white on time.
    #[test]
    fn no_increment_flags_on_long_move() {
        // Same timings, zero increment. White clock: 5000 - 4500 = 500 after ply 0; ply 2 wants
        // 9000 > 500 -> white flags, black (player 2) wins on time.
        let input = game(
            &["e2e4", "e7e5", "g2g4", "resign"],
            &[4_500, 1_000, 9_000, 0],
            5_000,
            0,
        );
        let r = replay(&input).expect("timeout is a valid terminal event");
        assert_eq!(r.winner, WINNER_P2, "black wins when white flags without increment");
        assert_eq!(r.reason, "timeout");
    }
}
