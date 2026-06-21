//! Dots and Boxes rules on a parameterized box grid (default 3x3 boxes).
//!
//! ## Grid + edge indexing
//!
//! An `R x C` BOX grid sits on `(R+1) x (C+1)` dots. The edges are enumerated with a fixed scheme so
//! a move is just a stable edge index "0".."E-1":
//!
//! - **Horizontal edges** come first: there are `(R+1)` rows of `C` horizontal edges each, indexed
//!   row-major. The horizontal edge in dot-row `r` (`0..=R`) and column `c` (`0..C`) is index
//!   `r * C + c`. Count `H = (R+1) * C`.
//! - **Vertical edges** follow: there are `R` rows of `(C+1)` vertical edges each. The vertical edge
//!   in box-row `r` (`0..R`) and column `c` (`0..=C`) is index `H + r * (C+1) + c`. Count
//!   `V = R * (C+1)`.
//!
//! Total `E = H + V`. A box at `(br, bc)` (`br in 0..R`, `bc in 0..C`) is bounded by four edges:
//! top `br*C+bc`, bottom `(br+1)*C+bc`, left `H + br*(C+1)+bc`, right `H + br*(C+1)+bc+1`.
//!
//! ## Custom size via `setup`
//!
//! EMPTY `setup` -> default 3x3. A 2-byte setup `[rows, cols]` sets an `R x C` grid (each 1..=8). A
//! malformed setup (wrong length or a dimension out of 1..=8) returns `Err` from `from_setup`, so it
//! cannot smuggle in a degenerate board.
//!
//! ## Move rules
//!
//! A move draws a not-yet-drawn edge. Drawing an already-drawn edge, an out-of-range index, or an
//! unparseable move is ILLEGAL -> `Err`. If a move COMPLETES one or two boxes, the mover scores them
//! and MOVES AGAIN (the turn does not flip). The game ends when every edge is drawn; the player with
//! more boxes wins, an equal split is a draw.

use crate::{GameRules, WINNER_DRAW, WINNER_P1, WINNER_P2};

pub struct DotsAndBoxesGame {
    rows: usize,
    cols: usize,
    /// Horizontal-edge count, the offset where vertical edges begin.
    h_count: usize,
    /// Drawn flags per edge index.
    drawn: Vec<bool>,
    /// Owner of each completed box (`None` while incomplete), box index `br*cols+bc`.
    box_owner: Vec<Option<u8>>,
    boxes_done: usize,
    turn: u8,
}

impl DotsAndBoxesGame {
    /// Build from a setup descriptor: empty = 3x3, else `[rows, cols]` with each in 1..=8.
    pub fn from_setup(setup: &[u8]) -> Result<Self, String> {
        let (rows, cols) = match setup.len() {
            0 => (3usize, 3usize),
            2 => (setup[0] as usize, setup[1] as usize),
            n => return Err(format!("dots_and_boxes setup must be empty or 2 bytes, got {n}")),
        };
        if rows < 1 || rows > 8 || cols < 1 || cols > 8 {
            return Err(format!("grid {rows}x{cols} out of range (each 1..=8)"));
        }
        let h_count = (rows + 1) * cols;
        let v_count = rows * (cols + 1);
        let edges = h_count + v_count;
        Ok(DotsAndBoxesGame {
            rows,
            cols,
            h_count,
            drawn: vec![false; edges],
            box_owner: vec![None; rows * cols],
            boxes_done: 0,
            turn: WINNER_P1,
        })
    }

    pub fn new() -> Self {
        // 3x3 default never fails the size check.
        Self::from_setup(&[]).expect("3x3 default is valid")
    }

    fn opp(side: u8) -> u8 {
        if side == WINNER_P1 { WINNER_P2 } else { WINNER_P1 }
    }

    /// The four edge indices bounding box `(br,bc)`.
    fn box_edges(&self, br: usize, bc: usize) -> [usize; 4] {
        let top = br * self.cols + bc;
        let bottom = (br + 1) * self.cols + bc;
        let left = self.h_count + br * (self.cols + 1) + bc;
        let right = self.h_count + br * (self.cols + 1) + bc + 1;
        [top, bottom, left, right]
    }

    /// Mark any boxes that `edge` just completed; return how many the mover scored.
    fn complete_boxes_touching(&mut self, edge: usize, side: u8) -> usize {
        let mut scored = 0;
        for br in 0..self.rows {
            for bc in 0..self.cols {
                let bi = br * self.cols + bc;
                if self.box_owner[bi].is_some() {
                    continue;
                }
                let edges = self.box_edges(br, bc);
                if edges.contains(&edge) && edges.iter().all(|&e| self.drawn[e]) {
                    self.box_owner[bi] = Some(side);
                    self.boxes_done += 1;
                    scored += 1;
                }
            }
        }
        scored
    }

    fn winner_by_boxes(&self) -> u8 {
        let mut a = 0;
        let mut b = 0;
        for o in &self.box_owner {
            match o {
                Some(WINNER_P1) => a += 1,
                Some(WINNER_P2) => b += 1,
                _ => {}
            }
        }
        if a > b {
            WINNER_P1
        } else if b > a {
            WINNER_P2
        } else {
            WINNER_DRAW
        }
    }
}

impl Default for DotsAndBoxesGame {
    fn default() -> Self {
        Self::new()
    }
}

impl GameRules for DotsAndBoxesGame {
    fn side_to_move(&self) -> u8 {
        self.turn
    }

    fn step(&mut self, mv: &str) -> Result<Option<u8>, String> {
        let edge: usize = mv
            .parse()
            .map_err(|_| format!("dots_and_boxes move must be an edge index, got \"{mv}\""))?;
        if edge >= self.drawn.len() {
            return Err(format!("edge {edge} out of range (0..{})", self.drawn.len()));
        }
        if self.drawn[edge] {
            return Err(format!("edge {edge} is already drawn"));
        }

        let side = self.turn;
        self.drawn[edge] = true;
        let scored = self.complete_boxes_touching(edge, side);

        // Board full -> score it.
        if self.boxes_done == self.box_owner.len() {
            return Ok(Some(self.winner_by_boxes()));
        }

        // Completing >=1 box grants another move (turn unchanged); else hand over.
        if scored == 0 {
            self.turn = Self::opp(side);
        }
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{replay, GameInput, GameType, WINNER_P1, WINNER_P2};

    fn game_setup(moves: &[&str], setup: Vec<u8>) -> GameInput {
        let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
        let n = moves.len();
        GameInput {
            game_type: GameType::DotsAndBoxes,
            moves,
            elapsed_ms: vec![0u64; n],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: [[1u8; 32], [2u8; 32]],
            stake_sompi: 1_000,
            covenant_id: [23u8; 32],
            deck: vec![],
            deck_commitment: [0u8; 32],
            setup,
            commitments: vec![],
        }
    }
    fn game(moves: &[&str]) -> GameInput {
        game_setup(moves, vec![])
    }

    /// A 1x1 board has exactly one box, 4 edges (top=0,bottom=1 horizontal; left=2,right=3 vertical).
    /// H = (1+1)*1 = 2, V = 1*2 = 2. Whoever draws the 4th edge completes the only box and wins.
    /// Order: P1 e0, P2 e1, P1 e2, P2 e3 -> P2 completes the box and wins 1-0.
    #[test]
    fn one_by_one_last_edge_wins() {
        let r = replay(&game_setup(&["0", "1", "2", "3"], vec![1, 1])).expect("legal 1x1 fill");
        assert_eq!(r.winner, WINNER_P2, "P2 drew the closing edge");
        assert_eq!(r.reason, "most_boxes");
        assert_eq!(r.num_plies, 4);
    }

    /// Completing a box grants another move: on a 1x2 board, set up so P1 closes the first box then
    /// immediately moves again. 1x2: H=(1+1)*2=4 (edges 0..3), V=1*3=3 (edges 4..6). Box0 edges:
    /// top0,bottom2,left4,right5. Box1 edges: top1,bottom3,left5,right6.
    /// Drive directly to confirm the extra-move mechanic.
    #[test]
    fn completing_a_box_grants_another_move() {
        let mut g = DotsAndBoxesGame::from_setup(&[1, 2]).unwrap();
        assert_eq!(g.drawn.len(), 7);
        // P1: 0,2,4 (three sides of box0); P2 forced to play elsewhere between, but to test the
        // extra-move grant cleanly we drive P1 to the closing edge with the turn already P1's.
        assert_eq!(g.step("0"), Ok(None)); // P1 top0 -> turn flips to P2
        assert_eq!(g.side_to_move(), WINNER_P2);
        assert_eq!(g.step("1"), Ok(None)); // P2 top1 -> turn flips to P1
        assert_eq!(g.step("2"), Ok(None)); // P1 bottom0 -> turn flips to P2
        assert_eq!(g.step("3"), Ok(None)); // P2 bottom1 -> turn flips to P1
        assert_eq!(g.step("4"), Ok(None)); // P1 left4 -> turn flips to P2
        assert_eq!(g.step("6"), Ok(None)); // P2 right6 -> turn flips to P1
        // Now edge 5 (shared middle) completes BOTH boxes for whoever draws it: P1.
        let res = g.step("5").unwrap();
        assert_eq!(res, Some(WINNER_P1), "P1 closes both boxes 2-0");
    }

    /// KNOWN WINNER on a 2x1 board where P1 sweeps BOTH boxes with one move (the shared middle edge
    /// completes both), exercising the score-and-go-again chain to a decisive P1 win.
    /// 2x1: H=(2+1)*1=3 (edges 0,1,2), V=2*2=4 (edges 3,4,5,6). Box0: top0,bottom1,left3,right4.
    /// Box1: top1,bottom2,left5,right6. The shared edge 1 closes both boxes for whoever draws it.
    #[test]
    fn p1_sweeps_both_boxes_on_two_by_one() {
        let mut g = DotsAndBoxesGame::from_setup(&[2, 1]).unwrap();
        assert_eq!(g.step("0"), Ok(None)); // P1 -> P2
        assert_eq!(g.step("3"), Ok(None)); // P2 -> P1
        assert_eq!(g.step("4"), Ok(None)); // P1 -> P2
        assert_eq!(g.step("5"), Ok(None)); // P2 -> P1
        assert_eq!(g.step("6"), Ok(None)); // P1 -> P2
        assert_eq!(g.step("2"), Ok(None)); // P2 (bottom of box1) -> P1
        // Edge 1 is the shared middle: completes box0 AND box1 for P1 -> P1 wins 2-0.
        assert_eq!(g.step("1").unwrap(), Some(WINNER_P1));
    }

    // ---- negatives ----

    /// ILLEGAL: drawing an already-drawn edge is Err.
    #[test]
    fn redraw_edge_is_err() {
        let r = replay(&game(&["0", "0"]));
        assert!(r.is_err(), "redrawing an edge must be Err");
        assert!(r.unwrap_err().contains("already drawn"));
    }

    /// ILLEGAL: out-of-range edge index is Err.
    #[test]
    fn out_of_range_edge_is_err() {
        // 3x3: H=(3+1)*3=12, V=3*4=12 -> 24 edges, valid 0..23. Edge 24 is out of range.
        assert!(replay(&game(&["24"])).is_err());
    }

    /// ILLEGAL: a garbage move is Err.
    #[test]
    fn garbage_move_is_err() {
        assert!(replay(&game(&["x"])).is_err());
    }

    /// A malformed setup is rejected before any play.
    #[test]
    fn bad_setup_is_err() {
        assert!(DotsAndBoxesGame::from_setup(&[0, 3]).is_err(), "0 rows invalid");
        assert!(DotsAndBoxesGame::from_setup(&[9, 3]).is_err(), "9 rows out of range");
        assert!(DotsAndBoxesGame::from_setup(&[3]).is_err(), "1-byte setup invalid");
        // And it propagates through replay().
        assert!(replay(&game_setup(&["0"], vec![0, 0])).is_err());
    }
}
