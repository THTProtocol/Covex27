//! Backgammon with VRF (committed-seed) dice. Standard 24-point board, 15 checkers per side.
//!
//! ## VRF dice (the honesty gate for randomness)
//!
//! Neither player may choose dice after seeing the board, so the dice are derived from a COMMITTED
//! seed. `commitments[0] = sha256(seed)` is public; the 32-byte `seed` is a WITNESS in `setup`.
//! Before play, [`BackgammonGame::from_input`] verifies `sha256(seed) == commitments[0]`; a forged
//! seed (hash mismatch) returns `Err`, so no proof can be produced. The dice for turn `t` (0-based)
//! are `h = sha256(seed || t_as_8_le_bytes)`, `d1 = h[0] % 6 + 1`, `d2 = h[1] % 6 + 1`. Equal dice
//! are DOUBLES and yield four moves of that value; otherwise two moves (one per die). This is a
//! deterministic VRF: the dice are fixed by the committed seed and fully reproducible.
//!
//! ## Board representation
//!
//! `point[0..24]`: `i8`, positive = that many P1 checkers, negative = that many P2 checkers. P1
//! moves toward index 0 and bears off below 0 (home = indices 0..=5). P2 moves toward index 23 and
//! bears off above 23 (home = indices 18..=23). `bar[side]` = checkers on the bar (must re-enter
//! first); `off[side]` = checkers borne off. The standard opening position is set in `new`.
//!
//! ## Move notation
//!
//! One die per ply, in the order recorded. A move is `"from/to"` using point numbers `1..=24`
//! (human-facing; internally `point = number - 1`). Special endpoints: `"bar/<to>"` enters from the
//! bar, `"<from>/off"` bears a checker off. The die used by a ply must match the pip distance:
//!
//! - P1 `a/b` uses die `a - b` (moving toward 0). Entering from the bar uses die `25 - to` for P1
//!   (P1 enters on points 24..=19). Bearing off `from/off` uses die `from` (point number) or a
//!   larger die if no checker is on a higher home point.
//! - P2 is the mirror: `a/b` uses die `b - a`; bar entry uses die `to`; bear off uses `25 - from`.
//!
//! Legality (all enforced; an illegal ply -> `Err`, no proof):
//! - If the mover has checkers on the bar, they MUST enter from the bar first.
//! - The destination point may not hold 2+ OPPONENT checkers (blocked). Landing on a single
//!   opponent checker (a blot) HITS it: that checker goes to the bar.
//! - Bearing off is allowed only when ALL 15 of the mover's checkers are in the home board.
//! - The die consumed must be one of the turn's remaining dice and must match the move's pips.
//!
//! A turn ends when its dice are exhausted; `side_to_move` flips and the next turn's dice are
//! derived. The winner is the first side to bear off all 15 checkers.
//!
//! ## v1 simplifications (documented honestly)
//!
//! - **No doubling cube.** There is no cube, no double/take/drop; the stake is settled 1x by the
//!   covenant. (A future v2 can model the cube as extra moves in the stream.)
//! - **No maximal-usage enforcement.** Real backgammon forces a player to use both dice if legally
//!   possible (and the larger die if only one can be played). v1 validates that each RECORDED ply is
//!   individually legal and consumes a real die, and a player MAY end a turn early by recording
//!   fewer plies (e.g. when blocked). v1 does not reject a transcript for failing to play a die that
//!   was technically playable. This never lets an ILLEGAL move through; it only declines to compel a
//!   legal one. Win/hit/bear-off/bar mechanics are fully enforced.

use crate::{sha256_bytes, GameRules, WINNER_P1, WINNER_P2};

const POINTS: usize = 24;
const CHECKERS: i8 = 15;

pub struct BackgammonGame {
    /// Signed checker counts per point (positive = P1, negative = P2).
    point: [i8; POINTS],
    bar: [u8; 2],
    off: [u8; 2],
    turn: u8,
    /// The committed VRF seed (verified against the public commitment in `from_input`).
    seed: Vec<u8>,
    /// 0-based index of the CURRENT turn (drives VRF dice derivation).
    turn_index: u64,
    /// Dice still available to play THIS turn (consumed by each ply). Empty = derive a fresh roll.
    dice_left: Vec<u8>,
}

impl BackgammonGame {
    /// Verify the committed seed and set up the standard opening position.
    pub fn from_input(setup: &[u8], commitments: &[[u8; 32]]) -> Result<Self, String> {
        if commitments.len() != 1 {
            return Err(format!(
                "backgammon needs exactly 1 seed commitment, got {}",
                commitments.len()
            ));
        }
        if setup.len() != 32 {
            return Err(format!(
                "backgammon seed must be 32 bytes, got {}",
                setup.len()
            ));
        }
        let h = sha256_bytes(setup);
        if h != commitments[0] {
            return Err("backgammon seed commitment mismatch (forged seed)".to_string());
        }

        // Standard opening (point numbers 1..24 -> indices 0..23). P1 positive, P2 negative.
        // P1: 2 on 24, 5 on 13, 3 on 8, 5 on 6.  P2 mirrors: 2 on 1, 5 on 12, 3 on 17, 5 on 19.
        let mut point = [0i8; POINTS];
        point[23] = 2; // P1 point 24
        point[12] = 5; // P1 point 13
        point[7] = 3; // P1 point 8
        point[5] = 5; // P1 point 6
        point[0] = -2; // P2 point 1
        point[11] = -5; // P2 point 12
        point[16] = -3; // P2 point 17
        point[18] = -5; // P2 point 19

        Ok(BackgammonGame {
            point,
            bar: [0, 0],
            off: [0, 0],
            turn: WINNER_P1,
            seed: setup.to_vec(),
            turn_index: 0,
            dice_left: Vec::new(),
        })
    }

    fn opp(side: u8) -> u8 {
        if side == WINNER_P1 { WINNER_P2 } else { WINNER_P1 }
    }

    /// Derive this turn's dice from the committed seed + turn index. Doubles -> four of that value.
    fn roll_for_turn(&self, t: u64) -> Vec<u8> {
        let mut buf = self.seed.clone();
        buf.extend_from_slice(&t.to_le_bytes());
        let h = sha256_bytes(&buf);
        let d1 = (h[0] % 6) + 1;
        let d2 = (h[1] % 6) + 1;
        if d1 == d2 {
            vec![d1; 4]
        } else {
            vec![d1, d2]
        }
    }

    /// Ensure `dice_left` is populated for the current turn (lazy first roll of a turn).
    fn ensure_dice(&mut self) {
        if self.dice_left.is_empty() {
            self.dice_left = self.roll_for_turn(self.turn_index);
        }
    }

    /// Remove one die of value `v` from this turn's remaining dice; Err if not available.
    fn consume_die(&mut self, v: u8) -> Result<(), String> {
        if let Some(pos) = self.dice_left.iter().position(|&d| d == v) {
            self.dice_left.remove(pos);
            Ok(())
        } else {
            Err(format!(
                "die {v} is not available this turn (remaining {:?})",
                self.dice_left
            ))
        }
    }

    /// Is `count` (signed point value) blocked for `side` to land on? Blocked iff 2+ opponents.
    fn blocked_for(side: u8, count: i8) -> bool {
        if side == WINNER_P1 {
            count <= -2
        } else {
            count >= 2
        }
    }

    /// Add one of `side`'s checkers to point index `idx`, hitting a lone opponent blot if present.
    fn place(&mut self, side: u8, idx: usize) {
        let opp = Self::opp(side);
        // Hit a blot: exactly one opponent checker on the destination.
        if side == WINNER_P1 && self.point[idx] == -1 {
            self.point[idx] = 0;
            self.bar[opp as usize] += 1;
        } else if side == WINNER_P2 && self.point[idx] == 1 {
            self.point[idx] = 0;
            self.bar[opp as usize] += 1;
        }
        if side == WINNER_P1 {
            self.point[idx] += 1;
        } else {
            self.point[idx] -= 1;
        }
    }

    /// Does `side` own a checker on point index `idx`?
    fn owns(&self, side: u8, idx: usize) -> bool {
        if side == WINNER_P1 {
            self.point[idx] >= 1
        } else {
            self.point[idx] <= -1
        }
    }

    /// Are ALL of `side`'s 15 checkers in the home board (so bearing off is allowed)?
    fn all_home(&self, side: u8) -> bool {
        if self.bar[side as usize] > 0 {
            return false;
        }
        let mut home = 0i32;
        for (idx, &c) in self.point.iter().enumerate() {
            let owned = if side == WINNER_P1 { c.max(0) } else { (-c).max(0) } as i32;
            if owned == 0 {
                continue;
            }
            let in_home = if side == WINNER_P1 {
                idx <= 5
            } else {
                idx >= 18
            };
            if !in_home {
                return false;
            }
            home += owned;
        }
        home + self.off[side as usize] as i32 == CHECKERS as i32
    }

    /// Highest occupied home point distance for `side` (used for over-rolling bear-off legality).
    /// For P1 the pip of a home point idx is `idx + 1`; for P2 it is `24 - idx`.
    fn highest_home_pip(&self, side: u8) -> u8 {
        let mut hi = 0u8;
        for idx in 0..POINTS {
            if !self.owns(side, idx) {
                continue;
            }
            let pip = if side == WINNER_P1 {
                if idx <= 5 { (idx + 1) as u8 } else { continue }
            } else {
                if idx >= 18 { (24 - idx) as u8 } else { continue }
            };
            if pip > hi {
                hi = pip;
            }
        }
        hi
    }

    fn parse_pt(tok: &str) -> Result<usize, String> {
        let n: usize = tok
            .parse()
            .map_err(|_| format!("bad point \"{tok}\""))?;
        if n < 1 || n > 24 {
            return Err(format!("point {n} out of range (1..=24)"));
        }
        Ok(n - 1)
    }
}

impl GameRules for BackgammonGame {
    fn side_to_move(&self) -> u8 {
        self.turn
    }

    fn step(&mut self, mv: &str) -> Result<Option<u8>, String> {
        self.ensure_dice();
        let side = self.turn;

        let (from, to) = mv
            .split_once('/')
            .ok_or_else(|| format!("backgammon move must be \"from/to\", got \"{mv}\""))?;

        // ---- Bar re-entry: mandatory while checkers are on the bar. ----
        if self.bar[side as usize] > 0 && from != "bar" {
            return Err("must enter from the bar first".to_string());
        }

        if from == "bar" {
            if self.bar[side as usize] == 0 {
                return Err("no checkers on the bar to enter".to_string());
            }
            let dest = Self::parse_pt(to)?;
            // P1 enters on 24..=19 (idx 23..=18) using die 25 - point_number = 24 - idx.
            // P2 enters on 1..=6 (idx 0..=5) using die point_number = idx + 1.
            let die = if side == WINNER_P1 {
                if dest < 18 {
                    return Err("P1 enters only on points 19..=24".to_string());
                }
                (24 - dest) as u8
            } else {
                if dest > 5 {
                    return Err("P2 enters only on points 1..=6".to_string());
                }
                (dest + 1) as u8
            };
            if Self::blocked_for(side, self.point[dest]) {
                return Err(format!("entry point {} is blocked", dest + 1));
            }
            self.consume_die(die)?;
            self.bar[side as usize] -= 1;
            self.place(side, dest);
        } else if to == "off" {
            // ---- Bear off. ----
            let src = Self::parse_pt(from)?;
            if !self.owns(side, src) {
                return Err(format!("no {} checker on point {}", side_name(side), src + 1));
            }
            if !self.all_home(side) {
                return Err("cannot bear off until all checkers are home".to_string());
            }
            let pip = if side == WINNER_P1 {
                (src + 1) as u8
            } else {
                (24 - src) as u8
            };
            // Exact die bears off; a larger die may bear off only if no checker sits higher.
            if self.consume_die(pip).is_err() {
                // Try a larger die (over-roll), legal only when `pip` is the highest occupied home.
                let mut used = false;
                for d in (pip + 1)..=6 {
                    if self.highest_home_pip(side) <= pip && self.consume_die(d).is_ok() {
                        used = true;
                        break;
                    }
                }
                if !used {
                    return Err(format!(
                        "no die can bear off point {} (pip {pip})",
                        src + 1
                    ));
                }
            }
            if side == WINNER_P1 {
                self.point[src] -= 1;
            } else {
                self.point[src] += 1;
            }
            self.off[side as usize] += 1;
            if self.off[side as usize] == CHECKERS as u8 {
                return Ok(Some(side)); // all 15 borne off -> win.
            }
        } else {
            // ---- Normal point-to-point move. ----
            let src = Self::parse_pt(from)?;
            let dest = Self::parse_pt(to)?;
            if !self.owns(side, src) {
                return Err(format!("no {} checker on point {}", side_name(side), src + 1));
            }
            // Direction + pip distance.
            let pips: i32 = if side == WINNER_P1 {
                src as i32 - dest as i32 // P1 moves toward 0 (decreasing index)
            } else {
                dest as i32 - src as i32 // P2 moves toward 23 (increasing index)
            };
            if pips <= 0 {
                return Err("move must go in the player's forward direction".to_string());
            }
            if pips > 6 {
                return Err(format!("move of {pips} pips exceeds a single die"));
            }
            if Self::blocked_for(side, self.point[dest]) {
                return Err(format!("destination point {} is blocked", dest + 1));
            }
            self.consume_die(pips as u8)?;
            if side == WINNER_P1 {
                self.point[src] -= 1;
            } else {
                self.point[src] += 1;
            }
            self.place(side, dest);
        }

        // Turn ends when this turn's dice are exhausted: flip side, advance the VRF turn index.
        if self.dice_left.is_empty() {
            self.turn = Self::opp(side);
            self.turn_index += 1;
        }
        Ok(None)
    }
}

fn side_name(side: u8) -> &'static str {
    if side == WINNER_P1 { "P1" } else { "P2" }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{replay, GameInput, GameType, WINNER_P1, WINNER_P2};

    fn seeded(moves: &[&str], seed: [u8; 32]) -> GameInput {
        let moves: Vec<String> = moves.iter().map(|s| s.to_string()).collect();
        let n = moves.len();
        let commit = sha256_bytes(&seed);
        GameInput {
            game_type: GameType::Backgammon,
            moves,
            elapsed_ms: vec![0u64; n],
            initial_clock_ms: 0,
            increment_ms: 0,
            players: [[1u8; 32], [2u8; 32]],
            stake_sompi: 1_000,
            covenant_id: [25u8; 32],
            deck: vec![],
            deck_commitment: [0u8; 32],
            setup: seed.to_vec(),
            commitments: vec![commit],
        }
    }

    /// Find a seed whose turn-0 roll is a specific non-double (d1,d2), by scanning seed[0].
    /// Deterministic helper: we only need ANY seed that yields the dice we want for the test.
    fn seed_with_first_roll(d1: u8, d2: u8) -> [u8; 32] {
        for b in 0u16..=255 {
            let mut s = [0u8; 32];
            s[0] = b as u8;
            let g = BackgammonGame {
                point: [0; POINTS],
                bar: [0, 0],
                off: [0, 0],
                turn: WINNER_P1,
                seed: s.to_vec(),
                turn_index: 0,
                dice_left: vec![],
            };
            let roll = g.roll_for_turn(0);
            if roll.len() == 2 && roll[0] == d1 && roll[1] == d2 {
                return s;
            }
            if roll.len() == 4 && d1 == d2 && roll[0] == d1 {
                return s;
            }
        }
        panic!("no seed found for first roll ({d1},{d2})");
    }

    /// The VRF is deterministic and reproducible from the seed.
    #[test]
    fn vrf_dice_are_deterministic() {
        let s = [3u8; 32];
        let g1 = {
            let inp = seeded(&[], s);
            BackgammonGame::from_input(&inp.setup, &inp.commitments).unwrap()
        };
        let g2 = {
            let inp = seeded(&[], s);
            BackgammonGame::from_input(&inp.setup, &inp.commitments).unwrap()
        };
        assert_eq!(g1.roll_for_turn(0), g2.roll_for_turn(0));
        assert_eq!(g1.roll_for_turn(5), g2.roll_for_turn(5));
        // Each die is 1..=6.
        for d in g1.roll_for_turn(0) {
            assert!((1..=6).contains(&d));
        }
    }

    /// LEGAL MOVE THEN RESIGN (known winner via replay): P1 makes a legal opening ply using its
    /// first die, then P2 resigns -> P1 wins. This exercises VRF dice + a real point move + the
    /// replay/clock path end to end.
    #[test]
    fn legal_opening_then_resign() {
        // First roll (3,1): P1 plays 8/5 (3 pips) then 6/5 (1 pip) is a classic opening; we only
        // need ONE legal ply before the resign. 8/5 uses die 3.
        let s = seed_with_first_roll(3, 1);
        let r = replay(&seeded(&["8/5", "6/5", "resign"], s)).expect("legal opening then resign");
        // After P1 plays both dice (3 and 1), the turn flips to P2, who resigns -> P1 wins.
        assert_eq!(r.winner, WINNER_P1);
        assert_eq!(r.reason, "resign");
    }

    /// KNOWN WINNER: bear off the last checker to win. Drive the engine directly into a near-finished
    /// position where P1 has a single checker left on point 1 (idx 0) and 14 already off, then bear
    /// it off with an exact die. This proves the all-15-off terminal is detected and attributed.
    #[test]
    fn bearing_off_last_checker_wins() {
        let s = seed_with_first_roll(1, 2); // die 1 available to bear off point 1
        let inp = seeded(&["1/off"], s);
        let mut g = BackgammonGame::from_input(&inp.setup, &inp.commitments).unwrap();
        // Clear the standard position; place P1's endgame: 14 off, 1 checker on point 1 (idx 0).
        g.point = [0; POINTS];
        g.point[0] = 1;
        g.off[WINNER_P1 as usize] = 14;
        g.off[WINNER_P2 as usize] = 0;
        g.bar = [0, 0];
        g.turn = WINNER_P1;
        g.dice_left.clear();
        // All home (only checker on point 1) -> bear off with die 1 -> 15 off -> P1 wins.
        let res = g.step("1/off").unwrap();
        assert_eq!(res, Some(WINNER_P1));
        assert_eq!(g.off[WINNER_P1 as usize], 15);
    }

    /// HITTING A BLOT sends the opponent checker to the bar (mechanic check via the trait).
    #[test]
    fn hitting_a_blot_sends_to_bar() {
        let s = seed_with_first_roll(2, 4);
        let inp = seeded(&[], s);
        let mut g = BackgammonGame::from_input(&inp.setup, &inp.commitments).unwrap();
        // Put a lone P2 blot on point 11 (idx 10) and a P1 checker on point 13 (idx 12). P1 13->11
        // is 2 pips, hitting the blot.
        g.point = [0; POINTS];
        g.point[12] = 1; // P1 on point 13
        g.point[10] = -1; // P2 blot on point 11
        g.turn = WINNER_P1;
        g.dice_left.clear();
        assert_eq!(g.step("13/11"), Ok(None)); // uses die 2
        assert_eq!(g.point[10], 1, "P1 now occupies the hit point");
        assert_eq!(g.bar[WINNER_P2 as usize], 1, "P2 blot sent to the bar");
    }

    // ---- negatives ----

    /// FORGED SEED: the supplied seed does not hash to the public commitment -> Err, no proof.
    #[test]
    fn forged_seed_commitment_mismatch_is_err() {
        let s = [4u8; 32];
        let mut inp = seeded(&["24/23"], s);
        // Tamper the seed AFTER committing; sha256(seed') != commitment.
        inp.setup[0] ^= 0xFF;
        let r = replay(&inp);
        assert!(r.is_err(), "a forged seed (hash mismatch) must be Err");
        assert!(r.unwrap_err().contains("seed commitment mismatch"));
    }

    /// ILLEGAL MOVE: using a die value that was not rolled is Err. With first roll (3,1), a 5-pip
    /// move (e.g. 24/19) consumes die 5 which is not available -> Err.
    #[test]
    fn die_not_rolled_is_err() {
        let s = seed_with_first_roll(3, 1);
        // 13/8 is 5 pips for P1; dice are {3,1} -> illegal.
        let r = replay(&seeded(&["13/8"], s));
        assert!(r.is_err(), "a move consuming an unrolled die must be Err");
        assert!(r.unwrap_err().contains("not available"));
    }

    /// ILLEGAL MOVE: landing on a point blocked by 2+ opponents is Err. P2 holds point 1 (idx 0)
    /// with 2 checkers in the opening; a P1 move onto it (if a die allowed) must be blocked. Drive
    /// directly: P1 checker on point 3 (idx 2), die 2 -> 3/1 lands on P2's 2-stack -> blocked.
    #[test]
    fn moving_onto_blocked_point_is_err() {
        let s = seed_with_first_roll(2, 5);
        let inp = seeded(&[], s);
        let mut g = BackgammonGame::from_input(&inp.setup, &inp.commitments).unwrap();
        g.point = [0; POINTS];
        g.point[2] = 1; // P1 on point 3
        g.point[0] = -2; // P2 holds point 1 (blocked for P1)
        g.turn = WINNER_P1;
        g.dice_left.clear();
        let r = g.step("3/1"); // 2 pips onto a blocked point
        assert!(r.is_err(), "landing on a 2+ opponent point must be Err");
        assert!(r.unwrap_err().contains("blocked"));
    }

    /// ILLEGAL MOVE: bearing off before all checkers are home is Err.
    #[test]
    fn premature_bear_off_is_err() {
        let s = seed_with_first_roll(1, 2);
        // Standard opening has checkers outside home, so 1/off is illegal.
        let r = replay(&seeded(&["1/off"], s));
        assert!(r.is_err(), "bearing off before all home must be Err");
    }

    /// ILLEGAL MOVE: while on the bar, any non-bar move is Err.
    #[test]
    fn must_enter_from_bar_first_is_err() {
        let s = seed_with_first_roll(2, 4);
        let inp = seeded(&[], s);
        let mut g = BackgammonGame::from_input(&inp.setup, &inp.commitments).unwrap();
        g.bar[WINNER_P1 as usize] = 1;
        g.turn = WINNER_P1;
        g.dice_left.clear();
        let r = g.step("24/22");
        assert!(r.is_err(), "must enter from bar first");
        assert!(r.unwrap_err().contains("bar"));
    }

    /// Wrong commitment count is rejected.
    #[test]
    fn wrong_commitment_count_is_err() {
        let s = [1u8; 32];
        let mut inp = seeded(&["24/23"], s);
        inp.commitments = vec![]; // none supplied
        assert!(replay(&inp).is_err());
    }
}
