//! Mancala (Kalah) rules. Standard 2x6 pits + 2 stores, 4 stones per pit at the start.
//!
//! ## Board layout (one flat array of 14 holes)
//!
//! ```text
//!   index:  0  1  2  3  4  5   6        7  8  9 10 11 12  13
//!           \---- P1 pits ----/  P1 store \---- P2 pits ----/  P2 store
//! ```
//!
//! Holes 0..5 are P1's pits, hole 6 is P1's store; holes 7..12 are P2's pits, hole 13 is P2's
//! store. Sowing runs in increasing index order (0 -> 13 -> wrap to 0), which is counterclockwise.
//!
//! ## Move notation
//!
//! A move is the mover's OWN pit, "0".."5" (relative to that player). For P1 pit `p` maps to hole
//! `p`; for P2 pit `p` maps to hole `7 + p`. Choosing an empty pit, an out-of-range pit, or any
//! unparseable move is ILLEGAL -> `Err` (the honesty gate).
//!
//! ## Sowing rules (standard Kalah)
//!
//! Pick up all stones from the chosen pit and drop one in each following hole, in order, SKIPPING
//! the OPPONENT's store (you never seed the opponent's store; your own store is seeded). Then:
//!
//! - **Extra turn**: if the last stone lands in the mover's OWN store, the mover goes again
//!   (`side_to_move` does not flip). The move stream must then contain another move for the same
//!   side; the universal "resign" sentinel still ends the game.
//! - **Capture**: if the last stone lands in one of the mover's OWN pits that was EMPTY before that
//!   stone (so it now holds exactly one stone), and the OPPOSITE pit holds stones, the mover
//!   captures both that single stone and all stones in the opposite pit into their store.
//!
//! ## Game end
//!
//! As soon as ALL pits on EITHER side are empty, the game ends: every remaining stone is swept into
//! its OWNER's store. The player with more stones in their store wins; equal stores is a draw.

use crate::{GameRules, WINNER_DRAW, WINNER_P1, WINNER_P2};

const P1_STORE: usize = 6;
const P2_STORE: usize = 13;
const HOLES: usize = 14;

/// A live Kalah board plus the rules driver.
pub struct MancalaGame {
    /// Stone counts per hole (see module layout).
    holes: [u32; HOLES],
    turn: u8,
}

impl MancalaGame {
    /// Standard opening: four stones in each of the 12 pits, both stores empty; P1 to move.
    pub fn new() -> Self {
        let mut holes = [4u32; HOLES];
        holes[P1_STORE] = 0;
        holes[P2_STORE] = 0;
        MancalaGame {
            holes,
            turn: WINNER_P1,
        }
    }

    fn store_of(side: u8) -> usize {
        if side == WINNER_P1 { P1_STORE } else { P2_STORE }
    }
    fn opp_store_of(side: u8) -> usize {
        if side == WINNER_P1 { P2_STORE } else { P1_STORE }
    }
    fn opp(side: u8) -> u8 {
        if side == WINNER_P1 { WINNER_P2 } else { WINNER_P1 }
    }

    /// The first/last hole index of `side`'s own pit row.
    fn pit_range(side: u8) -> (usize, usize) {
        if side == WINNER_P1 { (0, 5) } else { (7, 12) }
    }

    /// Is `hole` one of `side`'s own pits (not a store, not the opponent's pits)?
    fn is_own_pit(side: u8, hole: usize) -> bool {
        let (lo, hi) = Self::pit_range(side);
        hole >= lo && hole <= hi
    }

    /// The pit directly opposite `hole` (used for capture). Pit `i`(0..5) opposes pit `12 - i`.
    fn opposite_pit(hole: usize) -> usize {
        12 - hole
    }

    /// Are all of `side`'s pits empty?
    fn side_pits_empty(&self, side: u8) -> bool {
        let (lo, hi) = Self::pit_range(side);
        (lo..=hi).all(|h| self.holes[h] == 0)
    }

    /// Game-over check: if either side's pits are all empty, sweep remaining stones to owners and
    /// return the winner code. Otherwise `None`.
    fn check_end(&mut self) -> Option<u8> {
        let p1_done = self.side_pits_empty(WINNER_P1);
        let p2_done = self.side_pits_empty(WINNER_P2);
        if !p1_done && !p2_done {
            return None;
        }
        // Sweep each side's leftover pit stones into that side's own store.
        for h in 0..=5 {
            self.holes[P1_STORE] += self.holes[h];
            self.holes[h] = 0;
        }
        for h in 7..=12 {
            self.holes[P2_STORE] += self.holes[h];
            self.holes[h] = 0;
        }
        let a = self.holes[P1_STORE];
        let b = self.holes[P2_STORE];
        Some(if a > b {
            WINNER_P1
        } else if b > a {
            WINNER_P2
        } else {
            WINNER_DRAW
        })
    }
}

impl Default for MancalaGame {
    fn default() -> Self {
        Self::new()
    }
}

impl GameRules for MancalaGame {
    fn side_to_move(&self) -> u8 {
        self.turn
    }

    /// Verifiable score: the live store counts `[P1 store, P2 store]`. After a natural end the
    /// end-of-game sweep has banked every remaining stone, so this is the final tally; on an early
    /// resign/timeout it is the honest snapshot of stones banked so far. Committed in
    /// `GameResult::score` and covered by the same proof.
    fn score(&self) -> Option<[u64; 2]> {
        Some([self.holes[P1_STORE] as u64, self.holes[P2_STORE] as u64])
    }

    fn step(&mut self, mv: &str) -> Result<Option<u8>, String> {
        let side = self.turn;

        let pit: usize = mv
            .parse()
            .map_err(|_| format!("mancala move must be a pit \"0\"..\"5\", got \"{mv}\""))?;
        if pit > 5 {
            return Err(format!("pit {pit} out of range (0..5)"));
        }
        // Map the mover's relative pit to an absolute hole.
        let start = if side == WINNER_P1 { pit } else { 7 + pit };
        let stones = self.holes[start];
        if stones == 0 {
            return Err(format!("pit {pit} is empty"));
        }

        // Sow.
        self.holes[start] = 0;
        let opp_store = Self::opp_store_of(side);
        let mut hole = start;
        let mut remaining = stones;
        while remaining > 0 {
            hole = (hole + 1) % HOLES;
            if hole == opp_store {
                // Never seed the opponent's store.
                continue;
            }
            self.holes[hole] += 1;
            remaining -= 1;
        }
        let last = hole;

        // Capture: last stone in own previously-empty pit (now == 1) with stones opposite.
        let mut extra_turn = false;
        if last == Self::store_of(side) {
            extra_turn = true;
        } else if Self::is_own_pit(side, last) && self.holes[last] == 1 {
            let opposite = Self::opposite_pit(last);
            if self.holes[opposite] > 0 {
                let captured = self.holes[opposite] + self.holes[last];
                self.holes[opposite] = 0;
                self.holes[last] = 0;
                self.holes[Self::store_of(side)] += captured;
            }
        }

        // End-of-game sweep takes precedence over an extra turn.
        if let Some(w) = self.check_end() {
            return Ok(Some(w));
        }

        // Extra turn keeps the same side to move; otherwise hand over.
        if !extra_turn {
            self.turn = Self::opp(side);
        }
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{replay, GameInput, GameType, WINNER_P1, WINNER_P2};

    fn game(moves: &[&str]) -> GameInput {
        let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
        let n = moves.len();
        GameInput {
            game_type: GameType::Mancala,
            moves,
            elapsed_ms: vec![0u64; n],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: [[1u8; 32], [2u8; 32]],
            stake_sompi: 1_000,
            covenant_id: [22u8; 32],
            deck: vec![],
            deck_commitment: [0u8; 32],
            setup: vec![],
            commitments: vec![],
        }
    }

    /// From the standard opening, P1 sowing pit 2 (hole 2 has 4 stones) seeds holes 3,4,5,6. The last
    /// stone lands in P1's own store (hole 6) -> EXTRA TURN, store now 1, turn stays with P1.
    #[test]
    fn last_in_own_store_grants_extra_turn() {
        let mut g = MancalaGame::new();
        assert_eq!(g.step("2"), Ok(None));
        assert_eq!(g.holes[P1_STORE], 1, "one stone reached P1 store");
        assert_eq!(g.side_to_move(), WINNER_P1, "landing in own store -> go again");
        assert_eq!(g.holes[3], 5);
        assert_eq!(g.holes[4], 5);
        assert_eq!(g.holes[5], 5);
    }

    /// Standard sow that does NOT end in the store passes the turn to P2 and never seeds P2's store
    /// only when wrapping; from the opening pit 0 (4 stones) seeds holes 1,2,3,4 -> turn flips.
    #[test]
    fn normal_sow_passes_turn() {
        let mut g = MancalaGame::new();
        assert_eq!(g.step("0"), Ok(None));
        assert_eq!(g.side_to_move(), WINNER_P2);
        assert_eq!(g.holes[1], 5);
        assert_eq!(g.holes[4], 5);
        assert_eq!(g.holes[P1_STORE], 0, "pit 0 sow does not reach the store");
    }

    /// CAPTURE: engineer a position where P1's last stone lands in an empty own pit opposite a loaded
    /// opponent pit. Drive the board directly. P1 pit 0 has 1 stone, pit 1 empty; opposite of pit 1
    /// (hole 1) is hole 11. Put stones in hole 11. Sowing the single stone from hole 0 lands in hole
    /// 1 (was empty -> now 1) and captures hole 11 + that stone into P1's store.
    #[test]
    fn capture_into_own_store() {
        let mut g = MancalaGame::new();
        g.holes = [0u32; HOLES];
        g.holes[0] = 1; // P1 will sow this single stone
        g.holes[1] = 0; // lands here, empty before
        g.holes[3] = 2; // another non-empty P1 pit so P1's row is not all-empty after the move
        g.holes[11] = 5; // opposite of hole 1; gets captured
        g.holes[7] = 3; // keep P2 pits non-empty so the game does not end on the sweep
        g.turn = WINNER_P1;
        assert_eq!(g.step("0"), Ok(None));
        assert_eq!(g.holes[1], 0, "captured pit emptied");
        assert_eq!(g.holes[11], 0, "opposite pit captured");
        assert_eq!(g.holes[P1_STORE], 6, "captured 5 + the landing stone 1 = 6");
    }

    /// KNOWN WINNER via replay(): drive a tiny endgame where P1's move empties the board to a P1
    /// majority. We use a custom-free path: standard opening, P1 sows to store (extra turn), then
    /// resign by P2 -> decisive. But to exercise the natural majority END, build it by trait first.
    #[test]
    fn endgame_sweep_decides_majority() {
        let mut g = MancalaGame::new();
        // P1 has one stone left in pit 5; everything else of P1 is empty. P2 has stones in pits.
        g.holes = [0u32; HOLES];
        g.holes[5] = 1; // P1's only pit stone; sowing it lands in P1 store -> P1 pits now all empty
        g.holes[P1_STORE] = 20;
        g.holes[8] = 5; // P2 leftover pit stones (swept to P2 store on end)
        g.holes[P2_STORE] = 10;
        g.turn = WINNER_P1;
        // Sow pit 5: single stone -> hole 6 (P1 store). P1 pits now empty -> game ends.
        // Sweep: P2's 5 pit stones go to P2 store (10+5=15). P1 store = 21. 21 > 15 -> P1 wins.
        let r = g.step("5").unwrap().expect("this move ends the game");
        assert_eq!(r, WINNER_P1);
        assert_eq!(g.holes[P1_STORE], 21);
        assert_eq!(g.holes[P2_STORE], 15);
    }

    /// KNOWN WINNER end to end via replay(): legal opening then P2 resigns -> P1 wins.
    #[test]
    fn legal_then_resign_via_replay() {
        // P1 sows pit 2 (extra turn, stays P1), P1 sows pit 0, then it's P2's turn and P2 resigns.
        let r = replay(&game(&["2", "0", "resign"])).expect("legal moves then resign");
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "resign");
        // VERIFIABLE SCORE: pit 2 banked one stone in P1's store (the extra-turn move), pit 0 reached
        // no store. So the committed store tally at resign is [1, 0].
        assert_eq!(r.score, Some([1, 0]), "store tally must be committed");
    }

    /// Natural-end score: the sweep banks every remaining stone, so the committed score is the final
    /// store tally. Mirrors `endgame_sweep_decides_majority` but asserts the score via the trait.
    #[test]
    fn natural_end_commits_store_tally() {
        let mut g = MancalaGame::new();
        g.holes = [0u32; HOLES];
        g.holes[5] = 1;
        g.holes[P1_STORE] = 20;
        g.holes[8] = 5;
        g.holes[P2_STORE] = 10;
        g.turn = WINNER_P1;
        let w = g.step("5").unwrap().expect("this move ends the game");
        assert_eq!(w, WINNER_P1);
        // After the sweep: P1 store 21, P2 store 15.
        assert_eq!(g.score(), Some([21, 15]), "scorer reads the live store tally");
    }

    // ---- negatives ----

    /// ILLEGAL: sowing an empty pit is Err. Pit 2 from the opening lands in the store (extra turn),
    /// emptying pit 2; immediately sowing pit 2 again is illegal (empty).
    #[test]
    fn empty_pit_is_err() {
        let r = replay(&game(&["2", "2"]));
        assert!(r.is_err(), "sowing an empty pit must be Err");
        assert!(r.unwrap_err().contains("is empty"));
    }

    /// ILLEGAL: out-of-range pit (only 0..5 are valid) is Err.
    #[test]
    fn out_of_range_pit_is_err() {
        assert!(replay(&game(&["6"])).is_err());
    }

    /// ILLEGAL: a non-numeric move is Err.
    #[test]
    fn garbage_move_is_err() {
        assert!(replay(&game(&["x"])).is_err());
    }
}
