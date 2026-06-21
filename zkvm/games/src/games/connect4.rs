//! Connect Four rules. Standard 7-column x 6-row board.
//!
//! A move is a column index as a string, "0".."6". The mover drops a disc into that column; it
//! falls to the lowest empty cell. Player 1 (side 0) drops first. A move that connects four of
//! the mover's discs in a row (horizontal, vertical, or either diagonal) wins. A move into a full
//! column is illegal -> `Err`. If the 42nd disc fills the board with no four-in-a-row, it is a draw.

use crate::{GameRules, WINNER_DRAW, WINNER_P1, WINNER_P2};

const COLS: usize = 7;
const ROWS: usize = 6;

/// Cell occupancy: `None` empty, `Some(0)` player 1, `Some(1)` player 2.
type Cell = Option<u8>;

/// A live Connect Four board plus the rules driver.
pub struct Connect4Game {
    /// `board[col][row]`, row 0 is the bottom of the column.
    board: [[Cell; ROWS]; COLS],
    /// Whose turn: [`WINNER_P1`] (0) or [`WINNER_P2`] (1).
    turn: u8,
    /// Number of discs placed so far (for draw detection).
    placed: u32,
}

impl Connect4Game {
    /// Empty board, player 1 to move.
    pub fn new() -> Self {
        Connect4Game {
            board: [[None; ROWS]; COLS],
            turn: WINNER_P1,
            placed: 0,
        }
    }

    /// Lowest empty row in `col`, or `None` if the column is full.
    fn drop_row(&self, col: usize) -> Option<usize> {
        (0..ROWS).find(|&row| self.board[col][row].is_none())
    }

    /// Does the disc just placed at (`col`,`row`) by `player` complete a four-in-a-row?
    fn is_winning(&self, col: usize, row: usize, player: u8) -> bool {
        // The four directions to scan: horizontal, vertical, and the two diagonals.
        const DIRS: [(i32, i32); 4] = [(1, 0), (0, 1), (1, 1), (1, -1)];
        for (dc, dr) in DIRS {
            // Count the placed disc itself plus same-color discs both ways along this axis.
            let mut count = 1;
            for sign in [1i32, -1] {
                let mut c = col as i32 + dc * sign;
                let mut r = row as i32 + dr * sign;
                while c >= 0
                    && c < COLS as i32
                    && r >= 0
                    && r < ROWS as i32
                    && self.board[c as usize][r as usize] == Some(player)
                {
                    count += 1;
                    c += dc * sign;
                    r += dr * sign;
                }
            }
            if count >= 4 {
                return true;
            }
        }
        false
    }
}

impl Default for Connect4Game {
    fn default() -> Self {
        Self::new()
    }
}

impl GameRules for Connect4Game {
    fn side_to_move(&self) -> u8 {
        self.turn
    }

    fn step(&mut self, mv: &str) -> Result<Option<u8>, String> {
        // Parse the column. Must be a single digit 0..=6.
        let col: usize = mv
            .parse()
            .map_err(|_| format!("connect4 move must be a column \"0\"..\"6\", got \"{mv}\""))?;
        if col >= COLS {
            return Err(format!("column {col} out of range (0..6)"));
        }

        // Find the landing row; a full column is an illegal move.
        let row = self
            .drop_row(col)
            .ok_or_else(|| format!("column {col} is full"))?;

        let player = self.turn;
        self.board[col][row] = Some(player);
        self.placed += 1;

        if self.is_winning(col, row, player) {
            // The mover wins. Their side code IS the winner code.
            return Ok(Some(player));
        }

        if self.placed as usize == COLS * ROWS {
            // Board full, no winner -> draw.
            return Ok(Some(WINNER_DRAW));
        }

        // Hand the turn to the other player and continue.
        self.turn = if player == WINNER_P1 {
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
    use crate::{replay, GameInput, GameType};

    fn game(moves: &[&str]) -> GameInput {
        let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
        let n = moves.len();
        GameInput {
            game_type: GameType::Connect4,
            moves,
            elapsed_ms: vec![0u64; n],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: [[1u8; 32], [2u8; 32]],
            stake_sompi: 2_000,
            covenant_id: [3u8; 32],
            deck: vec![],
            deck_commitment: [0u8; 32],
            setup: vec![],
            commitments: vec![],
        }
    }

    /// P1 wins with a vertical four in column 0.
    /// P1 plays col 0 four times; P2 plays col 1 in between.
    /// Plies: 0:p1 c0, 1:p2 c1, 2:p1 c0, 3:p2 c1, 4:p1 c0, 5:p2 c1, 6:p1 c0 -> 4 in col 0.
    #[test]
    fn p1_vertical_win() {
        let input = game(&["0", "1", "0", "1", "0", "1", "0"]);
        let r = replay(&input).expect("vertical four is a legal win");
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "connect4");
        assert_eq!(r.num_plies, 7);
    }

    /// P1 wins with a horizontal four on the bottom row, columns 0..3.
    /// P1: c0,c1,c2,c3. P2 stacks harmlessly on c6 between each.
    #[test]
    fn p1_horizontal_win() {
        let input = game(&["0", "6", "1", "6", "2", "6", "3"]);
        let r = replay(&input).expect("horizontal four is a legal win");
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "connect4");
    }

    /// P2 wins with a vertical four in column 3.
    /// Plies: 0:p1 c0,1:p2 c3,2:p1 c0,3:p2 c3,4:p1 c0,5:p2 c3,6:p1 c1,7:p2 c3 -> p2 four in col 3.
    #[test]
    fn p2_vertical_win() {
        let input = game(&["0", "3", "0", "3", "0", "3", "1", "3"]);
        let r = replay(&input).expect("p2 vertical four");
        assert_eq!(r.winner, WINNER_P2);
        assert_eq!(r.num_plies, 8);
    }

    /// NEGATIVE: dropping into a full column is illegal -> Err.
    /// Fill column 0 with 6 discs (alternating players, all in col 0), then a 7th drop is illegal.
    #[test]
    fn full_column_is_err() {
        // 6 discs into col 0 fills it; note p1 would actually win vertically at ply 6,
        // so to reach a full column without a prior win we interleave so neither side gets 4.
        // Sequence in col 0 by player: p1,p2,p1,p2,p1,p2 -> max run is 1, no win, column full.
        // Then the 7th move into col 0 must error.
        let input = game(&["0", "0", "0", "0", "0", "0", "0"]);
        let err = replay(&input).unwrap_err();
        assert!(err.contains("is full"), "got: {err}");
    }

    /// NEGATIVE: an out-of-range column is illegal.
    #[test]
    fn out_of_range_column_is_err() {
        let input = game(&["7"]);
        assert!(replay(&input).is_err());
    }

    /// NEGATIVE: a non-numeric move is illegal.
    #[test]
    fn non_numeric_move_is_err() {
        let input = game(&["x"]);
        assert!(replay(&input).is_err());
    }
}
