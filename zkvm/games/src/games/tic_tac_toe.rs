//! Tic-Tac-Toe rules.
//!
//! Moves are a single cell index `"0".."8"` on a 3x3 board, indexed row-major:
//! ```text
//!   0 | 1 | 2
//!  ---+---+---
//!   3 | 4 | 5
//!  ---+---+---
//!   6 | 7 | 8
//! ```
//! Player 1 (X) moves first, then players strictly alternate. Placing a mark that completes a
//! horizontal, vertical, or diagonal line ends the game with that side as the winner. Filling the
//! ninth (last empty) cell with no line completed ends the game as a draw.
//!
//! The honesty gate: any move that is unparseable, out of range, or targets an already-occupied
//! cell returns `Err`, so `replay` cannot produce a result for an illegal game.

use crate::{GameRules, WINNER_DRAW, WINNER_P1, WINNER_P2};

/// The eight winning lines (cell-index triples): three rows, three columns, two diagonals.
const LINES: [[usize; 3]; 8] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // columns
    [0, 4, 8],
    [2, 4, 6], // diagonals
];

/// A Tic-Tac-Toe board. Each cell is `None` (empty) or `Some(side)` where `side` is the
/// winner code of the player who marked it ([`WINNER_P1`] or [`WINNER_P2`]).
pub struct TicTacToeGame {
    board: [Option<u8>; 9],
    /// Whose turn it is right now: [`WINNER_P1`] or [`WINNER_P2`].
    turn: u8,
    /// How many cells are filled (so a draw is detectable without rescanning the board).
    filled: u8,
}

impl TicTacToeGame {
    pub fn new() -> Self {
        TicTacToeGame {
            board: [None; 9],
            turn: WINNER_P1,
            filled: 0,
        }
    }

    /// Does `side` occupy a full line on the current board?
    fn has_line(&self, side: u8) -> bool {
        LINES
            .iter()
            .any(|line| line.iter().all(|&c| self.board[c] == Some(side)))
    }
}

impl Default for TicTacToeGame {
    fn default() -> Self {
        Self::new()
    }
}

impl GameRules for TicTacToeGame {
    fn side_to_move(&self) -> u8 {
        self.turn
    }

    fn step(&mut self, mv: &str) -> Result<Option<u8>, String> {
        // Parse the cell index. Reject anything that is not a bare "0".."8". `parse::<usize>`
        // already rejects signs, whitespace, and non-digits, so an explicit range check covers
        // the rest (e.g. "9", "10").
        let cell: usize = mv
            .parse()
            .map_err(|_| format!("not a cell index: \"{mv}\""))?;
        if cell > 8 {
            return Err(format!("cell index out of range (0..8): {cell}"));
        }
        if self.board[cell].is_some() {
            return Err(format!("cell {cell} is already occupied"));
        }

        let side = self.turn;
        self.board[cell] = Some(side);
        self.filled += 1;

        // Win: the side that just moved completed a line.
        if self.has_line(side) {
            return Ok(Some(side));
        }
        // Draw: the board is full with no line completed.
        if self.filled == 9 {
            return Ok(Some(WINNER_DRAW));
        }

        // Otherwise continue; flip the turn.
        self.turn = if side == WINNER_P1 {
            WINNER_P2
        } else {
            WINNER_P1
        };
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{replay, GameInput, GameResult, GameType, WINNER_DRAW, WINNER_P1, WINNER_P2};

    fn untimed(moves: &[&str]) -> GameInput {
        let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
        let n = moves.len();
        GameInput {
            game_type: GameType::TicTacToe,
            moves,
            elapsed_ms: vec![0u64; n],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: [[1u8; 32], [2u8; 32]],
            stake_sompi: 1,
            covenant_id: [0u8; 32],
            deck: vec![],
            deck_commitment: [0u8; 32],
            setup: vec![],
            commitments: vec![],
        }
    }

    fn play(moves: &[&str]) -> Result<GameResult, String> {
        replay(&untimed(moves))
    }

    // ---- positive: known results ----

    #[test]
    fn player_one_wins_top_row() {
        // X: 0,1,2 (top row); O: 3,4 in between. X completes the row on its third move.
        //   X X X
        //   O O .
        //   . . .
        let r = play(&["0", "3", "1", "4", "2"]).expect("legal winning game");
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "three_in_a_row");
        assert_eq!(r.num_plies, 5);
    }

    #[test]
    fn player_two_wins_left_column() {
        // X: 1,2,5 (no line); O: 0,3,6 (left column). O completes the column.
        //   O X X
        //   O . X
        //   O . .
        let r = play(&["1", "0", "2", "3", "5", "6"]).expect("legal winning game");
        assert_eq!(r.winner, WINNER_P2);
        assert_eq!(r.reason, "three_in_a_row");
        assert_eq!(r.num_plies, 6);
    }

    #[test]
    fn player_one_wins_diagonal() {
        // X: 0,4,8 (main diagonal); O: 1,2.
        //   X O O
        //   . X .
        //   . . X
        let r = play(&["0", "1", "4", "2", "8"]).expect("legal winning game");
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "three_in_a_row");
        assert_eq!(r.num_plies, 5);
    }

    #[test]
    fn full_board_no_line_is_draw() {
        // A classic cat's game (no three-in-a-row), all nine cells filled.
        //   X O X
        //   X O O
        //   O X X
        // Move order (X,O,X,O,...): 0,1,2,4,3,5,7,6,8
        let r = play(&["0", "1", "2", "4", "3", "5", "7", "6", "8"]).expect("legal drawn game");
        assert_eq!(r.winner, WINNER_DRAW);
        assert_eq!(r.reason, "draw");
        assert_eq!(r.num_plies, 9);
    }

    // ---- negative: illegal moves must make replay return Err ----

    #[test]
    fn occupied_cell_is_err() {
        // X plays 0, then O tries to play 0 again -> illegal.
        let r = play(&["0", "0"]);
        assert!(r.is_err(), "playing an occupied cell must be Err");
        assert!(r.unwrap_err().contains("already occupied"));
    }

    #[test]
    fn out_of_range_cell_is_err() {
        let r = play(&["9"]);
        assert!(r.is_err(), "cell index 9 is out of range");
        assert!(r.unwrap_err().contains("out of range"));
    }

    #[test]
    fn unparseable_move_is_err() {
        let r = play(&["x"]);
        assert!(r.is_err(), "non-numeric move must be Err");
        assert!(r.unwrap_err().contains("not a cell index"));
    }

    #[test]
    fn negative_index_is_err() {
        // parse::<usize> rejects the leading '-'.
        let r = play(&["-1"]);
        assert!(r.is_err(), "negative cell index must be Err");
    }

    #[test]
    fn whitespace_move_is_err() {
        // A bare cell index has no surrounding whitespace; "0 " must not be accepted.
        let r = play(&["0 "]);
        assert!(r.is_err(), "padded move must be Err");
    }

    // ---- direct trait-level checks (no clock/replay layer) ----

    #[test]
    fn side_to_move_alternates() {
        let mut g = TicTacToeGame::new();
        assert_eq!(g.side_to_move(), WINNER_P1);
        assert_eq!(g.step("0"), Ok(None));
        assert_eq!(g.side_to_move(), WINNER_P2);
        assert_eq!(g.step("1"), Ok(None));
        assert_eq!(g.side_to_move(), WINNER_P1);
    }

    #[test]
    fn winning_move_reports_the_mover() {
        // Drive the board directly to the moment P1 completes the top row.
        let mut g = TicTacToeGame::new();
        assert_eq!(g.step("0"), Ok(None)); // P1
        assert_eq!(g.step("3"), Ok(None)); // P2
        assert_eq!(g.step("1"), Ok(None)); // P1
        assert_eq!(g.step("4"), Ok(None)); // P2
        assert_eq!(g.step("2"), Ok(Some(WINNER_P1))); // P1 completes row
    }
}
