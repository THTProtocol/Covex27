//! game_engine.rs - server-authoritative game result determination.
//!
//! The server (and therefore the oracle and any on-chain payout) must NEVER trust a
//! client's claimed winner. This module replays a match's move log deterministically
//! and computes who actually won, so make_move rejects a forged winner and the oracle
//! / pot settlement act only on a result the server verified itself. This is the real
//! "prove who won" - for perfect-information games it is a full deterministic replay,
//! not an attestation.
//!
//! Move encodings mirror the frontend exactly:
//!   tictactoe: "<X|O><cell0-8>"  (X = white = player1, first mover)
//!   connect4 : "<R|Y>:<col0-6>"  (R = white = player1; drops to the lowest empty row)
//!   chess    : SAN per move ("e4", "Nf3", "Qxf7#", "O-O"); replayed with shakmaty,
//!              the winner is whoever delivered checkmate (white = player1).
//!
//! Unsupported game types return None; value-bearing callers must fail closed for them.

use shakmaty::san::San;
use shakmaty::{Chess, Color, Position};

#[derive(PartialEq, Eq, Debug, Clone, Copy)]
pub enum GameResult {
    /// player1 (X / R / first mover / "white").
    WhiteWins,
    /// player2 (O / Y / "black").
    BlackWins,
    Draw,
    Unfinished,
}

impl GameResult {
    /// Canonical covenant outcome: 0 = player1/white, 1 = player2/black, 2 = draw.
    pub fn outcome(self) -> Option<u32> {
        match self {
            GameResult::WhiteWins => Some(0),
            GameResult::BlackWins => Some(1),
            GameResult::Draw => Some(2),
            GameResult::Unfinished => None,
        }
    }

    /// The winner string the games table stores ("white"|"black"|"draw").
    pub fn winner_str(self) -> Option<&'static str> {
        match self {
            GameResult::WhiteWins => Some("white"),
            GameResult::BlackWins => Some("black"),
            GameResult::Draw => Some("draw"),
            GameResult::Unfinished => None,
        }
    }
}

/// True iff we can deterministically replay this game type to a verified result.
pub fn is_supported(game_type: &str) -> bool {
    matches!(game_type, "tictactoe" | "connect4" | "chess")
}

/// Map an oracle circuit_type ("tictactoe_v1") to a replayable game type, if any.
pub fn game_type_for_circuit(circuit_type: &str) -> Option<&'static str> {
    match circuit_type {
        "tictactoe_v1" => Some("tictactoe"),
        "connect4_v1" => Some("connect4"),
        "chess_v1" => Some("chess"),
        _ => None,
    }
}

/// Replay the move log and compute the result, or None if the type is unsupported.
pub fn result_from_moves(game_type: &str, moves: &[String]) -> Option<GameResult> {
    match game_type {
        "tictactoe" => Some(tictactoe(moves)),
        "connect4" => Some(connect4(moves)),
        "chess" => Some(chess(moves)),
        _ => None,
    }
}

/// Verify that `claimed_winner` ("white"|"black"|"draw"|None) is consistent with the
/// move log for a (possibly finishing) move. Err on a provable mismatch. Unsupported
/// game types return Ok (cannot verify here; the caller decides whether to fail closed).
pub fn verify_claim(
    game_type: &str,
    moves: &[String],
    claimed_winner: Option<&str>,
    finished: bool,
) -> Result<(), String> {
    let res = match result_from_moves(game_type, moves) {
        Some(r) => r,
        None => return Ok(()),
    };
    if finished {
        if res == GameResult::Unfinished {
            return Err("game claimed finished but the move log shows no win or draw".into());
        }
        if claimed_winner != res.winner_str() {
            return Err(format!(
                "claimed winner {:?} does not match the verified board result {:?}",
                claimed_winner,
                res.winner_str()
            ));
        }
    }
    Ok(())
}

fn tictactoe(moves: &[String]) -> GameResult {
    const LINES: [[usize; 3]; 8] = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
        [0, 4, 8], [2, 4, 6], // diagonals
    ];
    let mut board = [b' '; 9];
    for m in moves {
        let bytes = m.as_bytes();
        if bytes.len() < 2 {
            continue;
        }
        let label = bytes[0];
        if label != b'X' && label != b'O' {
            continue;
        }
        let cell: usize = match m[1..].parse() {
            Ok(c) if c < 9 => c,
            _ => continue,
        };
        if board[cell] != b' ' {
            continue; // ignore an illegal overwrite
        }
        board[cell] = label;
        if LINES.iter().any(|l| l.iter().all(|&i| board[i] == label)) {
            return if label == b'X' { GameResult::WhiteWins } else { GameResult::BlackWins };
        }
    }
    if board.iter().all(|&c| c != b' ') {
        GameResult::Draw
    } else {
        GameResult::Unfinished
    }
}

fn connect4(moves: &[String]) -> GameResult {
    const COLS: usize = 7;
    const ROWS: usize = 6;
    let mut board = [b' '; COLS * ROWS]; // index = r*COLS + c; r=0 top, r=ROWS-1 bottom
    let win_at = |b: &[u8], idx: usize, label: u8| -> bool {
        let (r, c) = ((idx / COLS) as isize, (idx % COLS) as isize);
        for (dr, dc) in [(0isize, 1isize), (1, 0), (1, 1), (1, -1)] {
            let mut cnt = 1;
            for d in 1..4isize {
                let (rr, cc) = (r + d * dr, c + d * dc);
                if rr < 0 || rr >= ROWS as isize || cc < 0 || cc >= COLS as isize
                    || b[rr as usize * COLS + cc as usize] != label
                {
                    break;
                }
                cnt += 1;
            }
            for d in 1..4isize {
                let (rr, cc) = (r - d * dr, c - d * dc);
                if rr < 0 || rr >= ROWS as isize || cc < 0 || cc >= COLS as isize
                    || b[rr as usize * COLS + cc as usize] != label
                {
                    break;
                }
                cnt += 1;
            }
            if cnt >= 4 {
                return true;
            }
        }
        false
    };
    let mut filled = 0usize;
    for m in moves {
        let parts: Vec<&str> = m.splitn(2, ':').collect();
        if parts.len() != 2 {
            continue;
        }
        let label = parts[0].as_bytes().first().copied().unwrap_or(b' ');
        if label != b'R' && label != b'Y' {
            continue;
        }
        let col: usize = match parts[1].parse() {
            Ok(c) if c < COLS => c,
            _ => continue,
        };
        // Drop to the lowest empty row (highest r), matching the frontend's dropInto.
        let mut landed = None;
        for r in (0..ROWS).rev() {
            let i = r * COLS + col;
            if board[i] == b' ' {
                board[i] = label;
                filled += 1;
                landed = Some(i);
                break;
            }
        }
        if let Some(i) = landed {
            if win_at(&board, i, label) {
                return if label == b'R' { GameResult::WhiteWins } else { GameResult::BlackWins };
            }
        }
    }
    if filled >= COLS * ROWS {
        GameResult::Draw
    } else {
        GameResult::Unfinished
    }
}

fn chess(moves: &[String]) -> GameResult {
    let mut pos = Chess::default();
    for m in moves {
        let s = m.trim();
        if s.is_empty() {
            continue;
        }
        // Control tokens (resign, draw offers) are not SAN; stop replay and let the
        // final position decide. A SAN that will not parse or is illegal in this
        // position is treated the same way (we cannot verify past it).
        let san = match San::from_ascii(s.as_bytes()) {
            Ok(san) => san,
            Err(_) => break,
        };
        let mv = match san.to_move(&pos) {
            Ok(mv) => mv,
            Err(_) => break,
        };
        pos = match pos.play(&mv) {
            Ok(next) => next,
            // to_move already proved legality, so this is unreachable in practice; if it
            // ever fires the state is unverifiable, so report Unfinished (pays no one).
            Err(_) => return GameResult::Unfinished,
        };
    }
    if pos.is_checkmate() {
        // The side to move has been checkmated, so the other side delivered mate.
        match pos.turn() {
            Color::White => GameResult::BlackWins, // white to move and mated -> player2
            Color::Black => GameResult::WhiteWins, // black to move and mated -> player1
        }
    } else if pos.is_stalemate() || pos.is_insufficient_material() {
        GameResult::Draw
    } else {
        GameResult::Unfinished
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mv(s: &[&str]) -> Vec<String> {
        s.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn tictactoe_white_wins_top_row() {
        // X: 0,1,2 (top row). O: 3,4 between.
        let r = tictactoe(&mv(&["X0", "O3", "X1", "O4", "X2"]));
        assert_eq!(r, GameResult::WhiteWins);
    }

    #[test]
    fn tictactoe_black_wins_diagonal() {
        // O takes 0,4,8 (a diagonal); X scattered and not a line.
        let r = tictactoe(&mv(&["X1", "O0", "X2", "O4", "X3", "O8"]));
        assert_eq!(r, GameResult::BlackWins);
    }

    #[test]
    fn tictactoe_draw_and_unfinished() {
        // Full board, no line: X O X / X O O / O X X
        assert_eq!(
            tictactoe(&mv(&["X0", "O1", "X2", "X3", "O4", "O5", "O6", "X7", "X8"])),
            GameResult::Draw
        );
        assert_eq!(tictactoe(&mv(&["X0", "O1"])), GameResult::Unfinished);
    }

    #[test]
    fn connect4_white_wins_vertical() {
        // R stacks column 0 four high; Y plays column 1.
        let r = connect4(&mv(&["R:0", "Y:1", "R:0", "Y:1", "R:0", "Y:1", "R:0"]));
        assert_eq!(r, GameResult::WhiteWins);
    }

    #[test]
    fn connect4_black_wins_horizontal() {
        // Y fills the bottom row cols 0-3; R stacks col 6 harmlessly.
        let r = connect4(&mv(&["R:6", "Y:0", "R:6", "Y:1", "R:6", "Y:2", "R:5", "Y:3"]));
        assert_eq!(r, GameResult::BlackWins);
    }

    #[test]
    fn connect4_unfinished() {
        assert_eq!(connect4(&mv(&["R:0", "Y:1", "R:2"])), GameResult::Unfinished);
    }

    #[test]
    fn chess_fools_mate_black_wins() {
        // 1. f3 e5 2. g4 Qh4# -> black delivers mate (player2).
        let r = chess(&mv(&["f3", "e5", "g4", "Qh4#"]));
        assert_eq!(r, GameResult::BlackWins);
    }

    #[test]
    fn chess_scholars_mate_white_wins() {
        // 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# -> white delivers mate (player1).
        let r = chess(&mv(&["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]));
        assert_eq!(r, GameResult::WhiteWins);
    }

    #[test]
    fn chess_unfinished_and_castling_parse() {
        // An ordinary opening with castling is replayable and still undecided.
        assert_eq!(
            chess(&mv(&["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6"])),
            GameResult::Unfinished
        );
        // A control token after a few moves stops replay; position is still undecided.
        assert_eq!(chess(&mv(&["e4", "e5", "resign"])), GameResult::Unfinished);
    }

    #[test]
    fn chess_rejects_a_forged_win_on_an_undecided_board() {
        // No checkmate on the board, so a self-declared chess win must be rejected.
        let moves = mv(&["e4", "e5"]);
        assert!(verify_claim("chess", &moves, Some("white"), true).is_err());
        // The true fool's-mate result is accepted.
        let mate = mv(&["f3", "e5", "g4", "Qh4#"]);
        assert!(verify_claim("chess", &mate, Some("black"), true).is_ok());
        assert!(verify_claim("chess", &mate, Some("white"), true).is_err());
    }

    #[test]
    fn verify_claim_rejects_a_forged_winner() {
        // Board shows white wins; a forged "black" claim must be rejected.
        let moves = mv(&["X0", "O3", "X1", "O4", "X2"]);
        assert!(verify_claim("tictactoe", &moves, Some("black"), true).is_err());
        assert!(verify_claim("tictactoe", &moves, Some("white"), true).is_ok());
        // Claiming finished with no decisive board is rejected.
        assert!(verify_claim("tictactoe", &mv(&["X0", "O1"]), Some("white"), true).is_err());
        // Unsupported game types are not validated here (caller fails closed).
        assert!(verify_claim("checkers", &mv(&["17-26"]), Some("white"), true).is_ok());
    }
}
