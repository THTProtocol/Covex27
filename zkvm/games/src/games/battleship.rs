//! Battleship with HIDDEN, COMMITTED boards (the second honesty gate, board-game flavour).
//!
//! ## Why a commitment
//!
//! Each player's ship placement must be fixed BEFORE any shot, and neither player may see the other's
//! board. So each board is COMMITTED up front: `commitments[i] = sha256(player_bytes_i)` is public,
//! and the actual placement (`player_bytes_i`) is a WITNESS supplied only to the prover. Before any
//! shot, [`BattleshipGame::from_input`] verifies BOTH commitments and validates BOTH placements are
//! legal. A forged board (hash mismatch) or an illegal placement (out of bounds, wrapped, or
//! overlapping ships) returns `Err`, so no proof can be produced for a cheated board.
//!
//! ## Board + fleet
//!
//! A standard 10x10 board (cells `0..100`, `cell = row*10 + col`). The fleet is the classic five
//! ships, in this fixed order: carrier 5, battleship 4, cruiser 3, submarine 3, destroyer 2 (17
//! ship cells total).
//!
//! ## Witness encoding (`setup`)
//!
//! `setup` concatenates the two players' board bytes back to back:
//! `player0_bytes (31) || player1_bytes (31)`, total 62 bytes. Each player's 31 bytes are:
//! `salt (16) || ship0 (3) || ship1 (3) || ship2 (3) || ship3 (3) || ship4 (3)`, where each ship is
//! `(length, start_cell, orientation)` and orientation `0` = horizontal (increasing column), `1` =
//! vertical (increasing row). The committed bytes hashed for `commitments[i]` are exactly that
//! player's 31-byte slice. The salt prevents a brute-force preimage search over the small placement
//! space, so the commitment genuinely hides the board.
//!
//! ## Shots
//!
//! Players alternate, P1 first. A move is a target cell `"0".."99"` fired at the OPPONENT's board.
//! The shot resolves honestly against the committed board: hit if the cell holds a ship, else miss.
//! Firing at a cell already fired at is ILLEGAL -> `Err` (keeps the transcript a faithful log). The
//! game ends when a player has hit ALL 17 of the opponent's ship cells (all ships sunk); that player
//! wins.
//!
//! ## v1 simplifications (documented honestly)
//!
//! - The fleet and board size are fixed (standard 10x10, classic 5-ship fleet).
//! - No "report which ship sank" messaging is modelled; only hit/miss and the all-sunk terminal.
//! - Ships may touch (adjacency is allowed), matching the most common rule set; only OVERLAP is
//!   illegal. Diagonal placement is not supported (orientation is horizontal or vertical only).

use crate::{sha256_bytes, GameRules, WINNER_P1, WINNER_P2};

const SIZE: usize = 10;
const CELLS: usize = SIZE * SIZE;
/// Classic fleet lengths, in the fixed witness order.
const FLEET: [u8; 5] = [5, 4, 3, 3, 2];
/// Total ship cells (5+4+3+3+2). A side loses once all of these are hit.
const SHIP_CELLS: u32 = 17;
const PLAYER_BYTES: usize = 16 + 3 * 5; // salt(16) + 5 ships * 3 bytes = 31

/// One player's resolved board: which cells hold a ship, and which have been shot at.
struct Board {
    ship: [bool; CELLS],
    shot: [bool; CELLS],
    hits: u32,
}

impl Board {
    /// Parse + validate one player's 31-byte witness slice and produce a legal occupancy board.
    /// Returns `Err` on out-of-bounds, row-wrapping, or overlapping ships.
    fn from_bytes(bytes: &[u8]) -> Result<Board, String> {
        if bytes.len() != PLAYER_BYTES {
            return Err(format!(
                "battleship player bytes must be {PLAYER_BYTES}, got {}",
                bytes.len()
            ));
        }
        let mut ship = [false; CELLS];
        // bytes[0..16] = salt (binds the commitment; not used for geometry).
        for (i, &expected_len) in FLEET.iter().enumerate() {
            let off = 16 + i * 3;
            let length = bytes[off];
            let start = bytes[off + 1] as usize;
            let orient = bytes[off + 2];
            if length != expected_len {
                return Err(format!(
                    "ship {i} length {length} != required {expected_len}"
                ));
            }
            if start >= CELLS {
                return Err(format!("ship {i} start {start} out of range (0..100)"));
            }
            if orient > 1 {
                return Err(format!("ship {i} orientation {orient} invalid (0 or 1)"));
            }
            let row = start / SIZE;
            let col = start % SIZE;
            for k in 0..length as usize {
                let cell = match orient {
                    0 => {
                        // Horizontal: stay on the same row, increasing column.
                        if col + k >= SIZE {
                            return Err(format!("ship {i} runs off the row (horizontal)"));
                        }
                        row * SIZE + (col + k)
                    }
                    _ => {
                        // Vertical: same column, increasing row.
                        if row + k >= SIZE {
                            return Err(format!("ship {i} runs off the column (vertical)"));
                        }
                        (row + k) * SIZE + col
                    }
                };
                if ship[cell] {
                    return Err(format!("ship {i} overlaps another ship at cell {cell}"));
                }
                ship[cell] = true;
            }
        }
        Ok(Board {
            ship,
            shot: [false; CELLS],
            hits: 0,
        })
    }
}

/// A live Battleship match: two verified hidden boards plus the shot driver.
pub struct BattleshipGame {
    boards: [Board; 2],
    turn: u8,
}

impl BattleshipGame {
    /// Verify both committed boards and validate both placements before any shot.
    ///
    /// - `setup` is the 62-byte witness (two 31-byte player slices, see module docs).
    /// - `commitments` must be exactly two entries; `commitments[i] == sha256(player_i bytes)`.
    ///
    /// A wrong commitment (forged board) or an illegal placement returns `Err` -> no proof.
    pub fn from_input(setup: &[u8], commitments: &[[u8; 32]]) -> Result<Self, String> {
        if commitments.len() != 2 {
            return Err(format!(
                "battleship needs exactly 2 board commitments, got {}",
                commitments.len()
            ));
        }
        if setup.len() != 2 * PLAYER_BYTES {
            return Err(format!(
                "battleship setup must be {} bytes (two {PLAYER_BYTES}-byte boards), got {}",
                2 * PLAYER_BYTES,
                setup.len()
            ));
        }
        let p0 = &setup[0..PLAYER_BYTES];
        let p1 = &setup[PLAYER_BYTES..2 * PLAYER_BYTES];

        // Commitment gate: each board must hash to its public commitment.
        let h0 = sha256_bytes(p0);
        if h0 != commitments[0] {
            return Err("battleship board 0 commitment mismatch (forged board)".to_string());
        }
        let h1 = sha256_bytes(p1);
        if h1 != commitments[1] {
            return Err("battleship board 1 commitment mismatch (forged board)".to_string());
        }

        // Placement legality gate.
        let b0 = Board::from_bytes(p0)?;
        let b1 = Board::from_bytes(p1)?;
        Ok(BattleshipGame {
            boards: [b0, b1],
            turn: WINNER_P1,
        })
    }

    fn opp(side: u8) -> u8 {
        if side == WINNER_P1 { WINNER_P2 } else { WINNER_P1 }
    }
}

impl GameRules for BattleshipGame {
    fn side_to_move(&self) -> u8 {
        self.turn
    }

    fn step(&mut self, mv: &str) -> Result<Option<u8>, String> {
        let cell: usize = mv
            .parse()
            .map_err(|_| format!("battleship shot must be a cell \"0\"..\"99\", got \"{mv}\""))?;
        if cell >= CELLS {
            return Err(format!("shot {cell} out of range (0..100)"));
        }
        let side = self.turn;
        let target = Self::opp(side) as usize;

        if self.boards[target].shot[cell] {
            return Err(format!("cell {cell} was already fired at"));
        }
        self.boards[target].shot[cell] = true;
        if self.boards[target].ship[cell] {
            self.boards[target].hits += 1;
            if self.boards[target].hits == SHIP_CELLS {
                // Every opponent ship cell hit -> the shooter wins.
                return Ok(Some(side));
            }
        }

        // Turn always passes after a shot (no extra-shot-on-hit rule in v1).
        self.turn = Self::opp(side);
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{replay, GameInput, GameType, WINNER_P1, WINNER_P2};

    /// Build one player's 31-byte witness from a salt + 5 ship placements (len,start,orient).
    fn player_bytes(salt: [u8; 16], ships: [(u8, u8, u8); 5]) -> Vec<u8> {
        let mut v = salt.to_vec();
        for (len, start, orient) in ships {
            v.push(len);
            v.push(start);
            v.push(orient);
        }
        v
    }

    /// A standard legal placement: all five ships laid horizontally on separate rows.
    /// carrier row0 (0..5), battleship row1 (10..14), cruiser row2 (20..23), submarine row3
    /// (30..33), destroyer row4 (40..42). No overlaps, all in-bounds.
    fn legal_ships() -> [(u8, u8, u8); 5] {
        [
            (5, 0, 0),  // carrier  cells 0,1,2,3,4
            (4, 10, 0), // battleship 10,11,12,13
            (3, 20, 0), // cruiser  20,21,22
            (3, 30, 0), // submarine 30,31,32
            (2, 40, 0), // destroyer 40,41
        ]
    }

    /// The 17 ship cells of `legal_ships()` (used to author a sinking-shot sequence).
    fn legal_ship_cells() -> Vec<usize> {
        let mut cells = Vec::new();
        cells.extend([0, 1, 2, 3, 4]);
        cells.extend([10, 11, 12, 13]);
        cells.extend([20, 21, 22]);
        cells.extend([30, 31, 32]);
        cells.extend([40, 41]);
        cells
    }

    fn game(setup: Vec<u8>, commitments: Vec<[u8; 32]>, moves: &[&str]) -> GameInput {
        let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
        let n = moves.len();
        GameInput {
            game_type: GameType::Battleship,
            moves,
            elapsed_ms: vec![0u64; n],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: [[1u8; 32], [2u8; 32]],
            stake_sompi: 1_000,
            covenant_id: [24u8; 32],
            deck: vec![],
            deck_commitment: [0u8; 32],
            setup,
            commitments,
        }
    }

    /// Helper: build a full, honest battleship input (both boards `legal_ships`, honest commitments).
    fn honest_input(moves: &[&str]) -> GameInput {
        let p0 = player_bytes([7u8; 16], legal_ships());
        let p1 = player_bytes([9u8; 16], legal_ships());
        let c0 = sha256_bytes(&p0);
        let c1 = sha256_bytes(&p1);
        let mut setup = p0.clone();
        setup.extend_from_slice(&p1);
        game(setup, vec![c0, c1], moves)
    }

    /// 17 DISTINCT empty cells (no ship in `legal_ships`) for harmless miss shots. Cells 50..67 are
    /// in rows 5/6, which hold no ships in `legal_ships()`.
    fn miss_cells() -> Vec<usize> {
        (50..67).collect()
    }

    /// KNOWN WINNER: P1 sinks all of P2's ships. P1 fires at every P2 ship cell on its turns; P2
    /// fires harmless misses (distinct empty cells on P1's board) in between. P1's 17th hit ends it.
    #[test]
    fn p1_sinks_all_and_wins() {
        let p2_cells = legal_ship_cells(); // 17 cells
        let misses = miss_cells(); // 17 distinct empty cells
        // Interleave: P1 fires a ship cell, P2 fires a distinct miss, ... P1's 17th shot wins.
        let mut moves: Vec<String> = Vec::new();
        for (i, &c) in p2_cells.iter().enumerate() {
            moves.push(c.to_string()); // P1 shot at P2's ship cell
            if i + 1 < p2_cells.len() {
                moves.push(misses[i].to_string()); // P2 distinct miss on P1's board
            }
        }
        let refs: Vec<&str> = moves.iter().map(|s| s.as_str()).collect();
        let r = replay(&honest_input(&refs)).expect("honest sinking game");
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "all_sunk");
    }

    /// P2 can win too (attributes the win to the OTHER side, not a hardcoded 0): P2 sinks P1's fleet.
    /// P1 wastes shots on distinct empty cells; P2 fires every ship cell. P2's 17th shot ends it.
    #[test]
    fn p2_sinks_all_and_wins() {
        let p1_cells = legal_ship_cells();
        let misses = miss_cells();
        let mut moves: Vec<String> = Vec::new();
        for (i, &c) in p1_cells.iter().enumerate() {
            moves.push(misses[i].to_string()); // P1 distinct miss on P2's board
            moves.push(c.to_string()); // P2 shot at P1's ship cell
        }
        let refs: Vec<&str> = moves.iter().map(|s| s.as_str()).collect();
        let r = replay(&honest_input(&refs)).expect("honest sinking game");
        assert_eq!(r.winner, WINNER_P2);
        assert_eq!(r.reason, "all_sunk");
    }

    /// A hit does not flip... actually v1 always flips after a shot. Confirm hit/miss bookkeeping and
    /// that the turn alternates regardless of hit or miss.
    #[test]
    fn shots_alternate_and_record_hits() {
        let mut g = {
            let inp = honest_input(&[]);
            BattleshipGame::from_input(&inp.setup, &inp.commitments).unwrap()
        };
        assert_eq!(g.side_to_move(), WINNER_P1);
        assert_eq!(g.step("0"), Ok(None)); // P1 hits P2's carrier cell 0
        assert_eq!(g.boards[1].hits, 1);
        assert_eq!(g.side_to_move(), WINNER_P2);
        assert_eq!(g.step("99"), Ok(None)); // P2 misses
        assert_eq!(g.boards[0].hits, 0);
        assert_eq!(g.side_to_move(), WINNER_P1);
    }

    // ---- negatives ----

    /// FORGED BOARD: the supplied board bytes do not hash to the public commitment -> Err, no proof.
    /// This is the core honesty gate: a player cannot present a board different from what they
    /// committed to.
    #[test]
    fn forged_board_commitment_mismatch_is_err() {
        let p0 = player_bytes([7u8; 16], legal_ships());
        let p1 = player_bytes([9u8; 16], legal_ships());
        let c0 = sha256_bytes(&p0);
        let c1 = sha256_bytes(&p1);
        let mut setup = p0.clone();
        setup.extend_from_slice(&p1);
        // Tamper P0's board AFTER committing: move the carrier. Now sha256(p0') != c0.
        setup[16 + 1] = 5; // change carrier start cell from 0 to 5
        let r = replay(&game(setup, vec![c0, c1], &["0"]));
        assert!(r.is_err(), "a forged board (hash mismatch) must be Err");
        assert!(r.unwrap_err().contains("commitment mismatch"));
    }

    /// ILLEGAL PLACEMENT: overlapping ships are rejected even with an HONEST commitment.
    /// We place the carrier and battleship on the SAME cells, commit honestly, and expect Err.
    #[test]
    fn overlapping_placement_is_err() {
        // Both carrier and battleship start at cell 0 horizontally -> overlap at 0,1,2,3.
        let ships = [
            (5, 0, 0),
            (4, 0, 0), // overlaps carrier
            (3, 20, 0),
            (3, 30, 0),
            (2, 40, 0),
        ];
        let p0 = player_bytes([1u8; 16], ships);
        let p1 = player_bytes([2u8; 16], legal_ships());
        let c0 = sha256_bytes(&p0); // HONEST commitment of the bad board
        let c1 = sha256_bytes(&p1);
        let mut setup = p0.clone();
        setup.extend_from_slice(&p1);
        let r = replay(&game(setup, vec![c0, c1], &["0"]));
        assert!(r.is_err(), "overlapping ships must be Err");
        assert!(r.unwrap_err().contains("overlaps"));
    }

    /// ILLEGAL PLACEMENT: a ship running off the board edge is rejected (honest commitment).
    #[test]
    fn off_board_placement_is_err() {
        // Carrier (length 5) starting at cell 7 horizontally would need columns 7..12 -> off the row.
        let ships = [(5, 7, 0), (4, 10, 0), (3, 20, 0), (3, 30, 0), (2, 40, 0)];
        let p0 = player_bytes([1u8; 16], ships);
        let p1 = player_bytes([2u8; 16], legal_ships());
        let c0 = sha256_bytes(&p0);
        let c1 = sha256_bytes(&p1);
        let mut setup = p0.clone();
        setup.extend_from_slice(&p1);
        let r = replay(&game(setup, vec![c0, c1], &["0"]));
        assert!(r.is_err(), "off-board ship must be Err");
        assert!(r.unwrap_err().contains("off the row"));
    }

    /// ILLEGAL MOVE: firing twice at the same cell is rejected.
    #[test]
    fn double_shot_same_cell_is_err() {
        // P1 fires 0 (hit), P2 fires 99 (miss), P1 fires 0 again -> already fired -> Err.
        let r = replay(&honest_input(&["0", "99", "0"]));
        assert!(r.is_err(), "firing the same cell twice must be Err");
        assert!(r.unwrap_err().contains("already fired"));
    }

    /// ILLEGAL MOVE: an out-of-range shot is Err.
    #[test]
    fn out_of_range_shot_is_err() {
        assert!(replay(&honest_input(&["100"])).is_err());
    }

    /// Wrong number of commitments is rejected.
    #[test]
    fn wrong_commitment_count_is_err() {
        let p0 = player_bytes([7u8; 16], legal_ships());
        let p1 = player_bytes([9u8; 16], legal_ships());
        let c0 = sha256_bytes(&p0);
        let mut setup = p0.clone();
        setup.extend_from_slice(&p1);
        // Only one commitment supplied.
        let r = replay(&game(setup, vec![c0], &["0"]));
        assert!(r.is_err(), "battleship requires exactly 2 commitments");
    }
}
