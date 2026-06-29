//! Real heads-up No-Limit Hold'em over a covenant match record.
//!
//! Trust model (consistent with the platform's disclosed oracle role): the
//! backend DEALS each hand from a random seed and publishes
//! `commitment = sha256("{seed}:{covenant_id}:{hand_no}")` BEFORE any card is
//! visible to anyone. When the hand ends the seed is revealed, so both players
//! (and any spectator) can re-run the specified shuffle and verify that hole
//! cards and board were fixed before play began. The backend cannot retro-fit
//! a deck, and a player cannot see the opponent's holes: fetching hole cards
//! requires a wallet-signed session (real Kaspa schnorr, see kaspa_msg.rs).
//!
//! Deterministic shuffle spec (mirrored by the frontend verifier):
//!   - cards 0..52, index = suit*13 + (rank-2); suits [c,d,h,s]; rank 2..=14
//!   - byte stream: block_i = sha256(ascii(seed) || ":" || ascii(i)), i = 0,1,..
//!   - next_u32 = next 4 stream bytes, big-endian
//!   - uniform(n): rejection-sample u32 below floor((2^32 - 1)/n)*n, then u % n
//!   - Fisher-Yates: for i in 51..=1 { j = uniform(i+1); swap(deck[i], deck[j]) }
//!   - deal: P1 holes deck[0],deck[2]; P2 holes deck[1],deck[3];
//!     flop deck[4],deck[5],deck[6]; turn deck[7]; river deck[8] (no burns)
//!
//! Chips are score units (each player starts with 100; blinds 1/2); the real
//! stake is the covenant pot, paid to the match winner through the existing
//! oracle attest + claim flow, exactly like the other arena games.

use axum::{
    extract::{Path, Query},
    routing::{get, post},
    Extension, Json, Router,
};
use rusqlite::params;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use tracing::info;

use crate::live;

pub const START_CHIPS: i64 = 100;
pub const SMALL_BLIND: i64 = 1;
pub const BIG_BLIND: i64 = 2;

pub fn poker_routes() -> Router {
    Router::new()
        .route("/poker/:covenant_id/state", get(state_handler))
        .route("/poker/:covenant_id/challenge", get(challenge_handler))
        .route("/poker/:covenant_id/session", post(session_handler))
        .route("/poker/:covenant_id/hole", post(hole_handler))
        .route("/poker/:covenant_id/deal", post(deal_handler))
        .route("/poker/:covenant_id/action", post(action_handler))
}

// ── deck, shuffle, evaluation ────────────────────────────────────────────────

const RANK_CH: [char; 13] = [
    '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A',
];
const SUIT_CH: [char; 4] = ['c', 'd', 'h', 's'];

pub fn card_str(idx: u8) -> String {
    format!(
        "{}{}",
        RANK_CH[(idx % 13) as usize],
        SUIT_CH[(idx / 13) as usize]
    )
}
fn card_rank(idx: u8) -> u8 {
    (idx % 13) + 2
}
fn card_suit(idx: u8) -> u8 {
    idx / 13
}

/// Counter-mode SHA256 byte stream (see module spec).
struct SeedRng {
    seed: String,
    counter: u64,
    buf: Vec<u8>,
    pos: usize,
}
impl SeedRng {
    fn new(seed: &str) -> Self {
        Self {
            seed: seed.to_string(),
            counter: 0,
            buf: Vec::new(),
            pos: 0,
        }
    }
    fn next_u32(&mut self) -> u32 {
        let mut out = [0u8; 4];
        for b in out.iter_mut() {
            if self.pos >= self.buf.len() {
                let mut h = Sha256::new();
                h.update(self.seed.as_bytes());
                h.update(b":");
                h.update(self.counter.to_string().as_bytes());
                self.buf = h.finalize().to_vec();
                self.pos = 0;
                self.counter += 1;
            }
            *b = self.buf[self.pos];
            self.pos += 1;
        }
        u32::from_be_bytes(out)
    }
    fn uniform(&mut self, n: u32) -> u32 {
        let limit = (u32::MAX / n) * n; // floor((2^32 - 1)/n)*n; JS verifier matches this exactly
        loop {
            let u = self.next_u32();
            if u < limit {
                return u % n;
            }
        }
    }
}

pub fn shuffled_deck(seed: &str) -> [u8; 52] {
    let mut deck = [0u8; 52];
    for (i, c) in deck.iter_mut().enumerate() {
        *c = i as u8;
    }
    let mut rng = SeedRng::new(seed);
    for i in (1..=51usize).rev() {
        let j = rng.uniform((i + 1) as u32) as usize;
        deck.swap(i, j);
    }
    deck
}

pub fn hand_commitment(seed: &str, covenant_id: &str, hand_no: i64) -> String {
    let mut h = Sha256::new();
    h.update(format!("{}:{}:{}", seed, covenant_id, hand_no).as_bytes());
    hex::encode(h.finalize())
}

/// Evaluate a 5-card hand: (category, tiebreaks desc). Higher tuple wins.
/// 8 straight flush, 7 quads, 6 full house, 5 flush, 4 straight, 3 trips,
/// 2 two pair, 1 pair, 0 high card.
fn evaluate5(cards: &[u8; 5]) -> (u8, Vec<u8>) {
    let mut ranks: Vec<u8> = cards.iter().map(|&c| card_rank(c)).collect();
    ranks.sort_unstable_by(|a, b| b.cmp(a));
    let flush = cards.iter().all(|&c| card_suit(c) == card_suit(cards[0]));

    let mut uniq = ranks.clone();
    uniq.dedup();
    let straight_high: Option<u8> = if uniq.len() == 5 {
        if uniq[0] - uniq[4] == 4 {
            Some(uniq[0])
        } else if uniq == [14, 5, 4, 3, 2] {
            Some(5) // wheel
        } else {
            None
        }
    } else {
        None
    };

    let mut counts: HashMap<u8, u8> = HashMap::new();
    for &r in &ranks {
        *counts.entry(r).or_insert(0) += 1;
    }
    let mut groups: Vec<(u8, u8)> = counts.into_iter().map(|(r, c)| (c, r)).collect();
    groups.sort_unstable_by(|a, b| b.cmp(a)); // count desc, then rank desc
    let shape: Vec<u8> = groups.iter().map(|g| g.0).collect();
    let order: Vec<u8> = groups.iter().map(|g| g.1).collect();

    match (flush, straight_high) {
        (true, Some(h)) => (8, vec![h]),
        (true, None) => (5, ranks),
        (false, Some(h)) => (4, vec![h]),
        _ => match shape.as_slice() {
            [4, 1] => (7, order),
            [3, 2] => (6, order),
            [3, 1, 1] => (3, order),
            [2, 2, 1] => (2, order),
            [2, 1, 1, 1] => (1, order),
            _ => (0, ranks),
        },
    }
}

/// Best 5-of-7 by checking all 21 combinations. Small, obviously correct.
pub fn evaluate7(cards: &[u8; 7]) -> (u8, Vec<u8>) {
    let mut best: Option<(u8, Vec<u8>)> = None;
    for skip_a in 0..7 {
        for skip_b in (skip_a + 1)..7 {
            let mut five = [0u8; 5];
            let mut k = 0;
            for (i, &c) in cards.iter().enumerate() {
                if i != skip_a && i != skip_b {
                    five[k] = c;
                    k += 1;
                }
            }
            let score = evaluate5(&five);
            if best.as_ref().map_or(true, |b| score > *b) {
                best = Some(score);
            }
        }
    }
    best.unwrap()
}

pub fn hand_name(cat: u8) -> &'static str {
    match cat {
        8 => "straight flush",
        7 => "four of a kind",
        6 => "full house",
        5 => "flush",
        4 => "straight",
        3 => "three of a kind",
        2 => "two pair",
        1 => "a pair",
        _ => "high card",
    }
}

// ── betting state machine (derived by replaying the action log) ─────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PAction {
    pub seat: u8, // 0 = player1, 1 = player2
    pub act: String,
    /// for bet/raise: TOTAL committed on this street after the action
    #[serde(default)]
    pub amount: i64,
}

#[derive(Debug, Clone)]
pub struct HandState {
    pub stacks: [i64; 2],    // chips behind
    pub committed: [i64; 2], // this street
    pub pot: i64,            // chips from completed streets
    pub street: u8,          // 0 preflop, 1 flop, 2 turn, 3 river
    pub to_act: Option<u8>,
    pub current_bet: i64,
    pub min_raise_to: i64,
    /// (winner seat, "fold") or (2, "showdown") once the hand is decided
    pub over: Option<(u8, &'static str)>,
    pub all_in_runout: bool,
}

impl HandState {
    pub fn total_pot(&self) -> i64 {
        self.pot + self.committed[0] + self.committed[1]
    }
}

/// Close the current betting street: refund any uncalled excess (short all-in
/// calls), sweep committed chips into the pot, then either advance the street,
/// trigger the all-in runout, or reach showdown after the river.
fn close_street(st: &mut HandState, acted: &mut [bool; 2], bb_seat: u8) {
    let hi = if st.committed[0] >= st.committed[1] {
        0
    } else {
        1
    };
    let refund = st.committed[hi] - st.committed[1 - hi];
    st.stacks[hi] += refund;
    st.committed[hi] -= refund;

    st.pot += st.committed[0] + st.committed[1];
    st.committed = [0, 0];
    st.current_bet = 0;
    st.min_raise_to = BIG_BLIND;
    *acted = [false, false];

    if st.stacks[0] == 0 || st.stacks[1] == 0 {
        st.all_in_runout = true;
        st.street = 3;
        st.over = Some((2, "showdown"));
        st.to_act = None;
    } else if st.street == 3 {
        st.over = Some((2, "showdown"));
        st.to_act = None;
    } else {
        st.street += 1;
        st.to_act = Some(bb_seat); // non-button acts first postflop
    }
}

/// Replay blinds + actions into a HandState. Err = the LAST action is illegal
/// (the stored log is always legal because each append is validated first).
pub fn replay(chips_start: [i64; 2], button: u8, actions: &[PAction]) -> Result<HandState, String> {
    let sb = button as usize;
    let bb = (1 - button) as usize;
    let mut st = HandState {
        stacks: chips_start,
        committed: [0, 0],
        pot: 0,
        street: 0,
        to_act: Some(button),
        current_bet: 0,
        min_raise_to: 0,
        over: None,
        all_in_runout: false,
    };
    // post blinds (capped all-in for short stacks)
    let post_sb = SMALL_BLIND.min(st.stacks[sb]);
    st.stacks[sb] -= post_sb;
    st.committed[sb] = post_sb;
    let post_bb = BIG_BLIND.min(st.stacks[bb]);
    st.stacks[bb] -= post_bb;
    st.committed[bb] = post_bb;
    st.current_bet = st.committed[sb].max(st.committed[bb]);
    st.min_raise_to = st.current_bet + BIG_BLIND;

    let mut acted = [false, false];

    if st.stacks[0] == 0 && st.stacks[1] == 0 {
        close_street(&mut st, &mut acted, bb as u8);
    }

    for a in actions {
        let me = a.seat as usize;
        if st.over.is_some() {
            return Err("hand is already over".into());
        }
        match st.to_act {
            Some(s) if s as usize == me => {}
            _ => return Err("not your turn".into()),
        }
        let opp = 1 - me;
        match a.act.as_str() {
            "fold" => {
                // winner takes everything committed (incl. their own excess back)
                st.pot += st.committed[0] + st.committed[1];
                st.committed = [0, 0];
                st.over = Some((opp as u8, "fold"));
                st.to_act = None;
            }
            "check" => {
                if st.committed[me] != st.current_bet {
                    return Err("cannot check facing a bet".into());
                }
                acted[me] = true;
                if acted[opp] {
                    close_street(&mut st, &mut acted, bb as u8);
                } else {
                    st.to_act = Some(opp as u8);
                }
            }
            "call" => {
                if st.current_bet == st.committed[me] {
                    return Err("nothing to call (check instead)".into());
                }
                let need = (st.current_bet - st.committed[me]).min(st.stacks[me]);
                st.stacks[me] -= need;
                st.committed[me] += need;
                acted[me] = true;
                // preflop limp: SB completing the blind leaves BB the option
                let bb_option =
                    st.street == 0 && me == sb && !acted[bb] && st.current_bet == BIG_BLIND;
                if bb_option {
                    st.to_act = Some(bb as u8);
                } else {
                    close_street(&mut st, &mut acted, bb as u8);
                }
            }
            "bet" | "raise" => {
                let to_total = a.amount;
                let max_total = st.committed[me] + st.stacks[me];
                if to_total <= st.current_bet {
                    return Err("raise must exceed the current bet".into());
                }
                if to_total < st.min_raise_to && to_total < max_total {
                    return Err(format!("minimum raise is to {}", st.min_raise_to));
                }
                if to_total > max_total {
                    return Err("not enough chips".into());
                }
                let add = to_total - st.committed[me];
                st.stacks[me] -= add;
                let prev_bet = st.current_bet;
                st.committed[me] = to_total;
                st.current_bet = to_total;
                st.min_raise_to = to_total + (to_total - prev_bet).max(BIG_BLIND);
                acted[me] = true;
                acted[opp] = false;
                st.to_act = Some(opp as u8);
            }
            other => return Err(format!("unknown action '{}'", other)),
        }
    }
    Ok(st)
}

// ── storage helpers ──────────────────────────────────────────────────────────

fn seats(db: &crate::db::Db, covenant_id: &str) -> Option<(String, String, String)> {
    let conn = crate::db::conn_or_log(db, "poker::seats")?;
    conn.query_row(
        "SELECT player1, player2, status FROM skill_games WHERE covenant_id = ?1 AND game_type = 'poker'",
        params![covenant_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .ok()
}

fn match_row(db: &crate::db::Db, covenant_id: &str) -> Option<(i64, i64, i64, i64, String)> {
    let conn = crate::db::conn_or_log(db, "poker::match_row")?;
    conn.query_row(
        "SELECT chips1, chips2, hand_no, button, status FROM poker_matches WHERE covenant_id = ?1",
        params![covenant_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )
    .ok()
}

#[allow(clippy::type_complexity)]
fn hand_row(
    db: &crate::db::Db,
    covenant_id: &str,
    hand_no: i64,
) -> Option<(
    String,
    String,
    String,
    String,
    Option<String>,
    i64,
    i64,
    i64,
)> {
    let conn = crate::db::conn_or_log(db, "poker::hand_row")?;
    conn.query_row(
        "SELECT seed, commitment, phase, actions, result, chips1_start, chips2_start, button \
         FROM poker_hands WHERE covenant_id = ?1 AND hand_no = ?2",
        params![covenant_id, hand_no],
        |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
            ))
        },
    )
    .ok()
}

fn token_address(db: &crate::db::Db, covenant_id: &str, token: &str) -> Option<String> {
    let conn = crate::db::conn_or_log(db, "poker::token_address")?;
    conn.query_row(
        "SELECT address FROM poker_sessions WHERE token = ?1 AND covenant_id = ?2 AND expires > unixepoch()",
        params![token, covenant_id],
        |r| r.get(0),
    )
    .ok()
}

fn seat_of(addr: &str, p1: &str, p2: &str) -> Option<u8> {
    if addr == p1 {
        Some(0)
    } else if addr == p2 {
        Some(1)
    } else {
        None
    }
}

fn publish_update(covenant_id: &str) {
    live::publish(
        "game_update",
        json!({"covenant_id": covenant_id, "poker": true}),
    );
}

// ── settlement ───────────────────────────────────────────────────────────────

/// If the replayed state says the hand is over: write the result (REVEALING the
/// seed), move chips on the match, advance hand_no + button, and finish the
/// skill_games match when a stack hits zero. Idempotent per hand via the
/// result-IS-NULL guard.
fn settle_if_over(
    db: &crate::db::Db,
    covenant_id: &str,
    hand_no: i64,
    seed: &str,
    button: u8,
    st: &HandState,
) {
    let Some((winner_code, reason)) = st.over else {
        return;
    };
    let deck = shuffled_deck(seed);
    let holes = [[deck[0], deck[2]], [deck[1], deck[3]]];
    let board: Vec<u8> = deck[4..9].to_vec();
    let total_pot = st.total_pot();

    let (winner_seat, win_share, win_label): (Option<u8>, [i64; 2], String) = if winner_code == 2 {
        let mut seven0 = [holes[0][0], holes[0][1], 0, 0, 0, 0, 0];
        let mut seven1 = [holes[1][0], holes[1][1], 0, 0, 0, 0, 0];
        seven0[2..7].copy_from_slice(&board);
        seven1[2..7].copy_from_slice(&board);
        let s0 = evaluate7(&seven0);
        let s1 = evaluate7(&seven1);
        if s0 > s1 {
            (Some(0), [total_pot, 0], hand_name(s0.0).to_string())
        } else if s1 > s0 {
            (Some(1), [0, total_pot], hand_name(s1.0).to_string())
        } else {
            // split pot; the odd chip goes to the big-blind seat
            let half = total_pot / 2;
            let mut share = [half, half];
            share[(1 - button) as usize] += total_pot - 2 * half;
            (None, share, format!("split, {}", hand_name(s0.0)))
        }
    } else {
        let mut share = [0i64, 0];
        share[winner_code as usize] = total_pot;
        (Some(winner_code), share, "opponent folded".to_string())
    };

    let new_chips = [st.stacks[0] + win_share[0], st.stacks[1] + win_share[1]];
    let match_over = new_chips[0] <= 0 || new_chips[1] <= 0;

    let result = json!({
        "hand_no": hand_no,
        "reason": reason,
        "winner_seat": winner_seat,
        "win_label": win_label,
        "pot": total_pot,
        "seed": seed,
        "commitment": hand_commitment(seed, covenant_id, hand_no),
        "board": board.iter().map(|&c| card_str(c)).collect::<Vec<_>>(),
        "holes": [
            [card_str(holes[0][0]), card_str(holes[0][1])],
            [card_str(holes[1][0]), card_str(holes[1][1])],
        ],
        "chips_after": new_chips,
        "match_over": match_over,
    });

    {
        // This write MUST happen to settle the hand, but on sustained pool exhaustion we degrade
        // safely rather than panic the request thread: skip this attempt and return. The
        // `result IS NULL` guard makes the settle idempotent, so a later call (or the opponent's
        // next request) retries it; no double-settle and no value moves on a missed pass.
        let Some(conn) = crate::db::conn_or_log(db, "poker::settle_if_over") else {
            return;
        };
        let updated = conn
            .execute(
                "UPDATE poker_hands SET phase = 'ended', result = ?1 \
                 WHERE covenant_id = ?2 AND hand_no = ?3 AND result IS NULL",
                params![result.to_string(), covenant_id, hand_no],
            )
            .unwrap_or(0);
        if updated == 0 {
            return; // another request already settled this hand
        }
        let _ = conn.execute(
            "UPDATE poker_matches SET chips1 = ?1, chips2 = ?2, hand_no = ?3, button = ?4, \
             status = ?5, updated_at = unixepoch() WHERE covenant_id = ?6",
            params![
                new_chips[0],
                new_chips[1],
                hand_no + 1,
                (1 - button) as i64,
                if match_over { "finished" } else { "active" },
                covenant_id
            ],
        );
        if match_over {
            let winner = if new_chips[0] > 0 { "white" } else { "black" };
            let _ = conn.execute(
                "UPDATE skill_games SET status = 'finished', winner = ?1, updated_at = unixepoch() \
                 WHERE covenant_id = ?2",
                params![winner, covenant_id],
            );
            let net: String = conn
                .query_row(
                    "SELECT network FROM covenants WHERE tx_id = ?1",
                    params![covenant_id],
                    |r| r.get(0),
                )
                .unwrap_or_else(|_| "testnet-12".into());
            crate::db::record_event_once(
                &conn,
                "game_finished",
                covenant_id,
                &net,
                0.0,
                &format!("poker match decided, winner {}", winner),
            );
        }
    }
    info!(
        "Poker[{}]: hand {} settled ({}), chips {:?}{}",
        &covenant_id[..16.min(covenant_id.len())],
        hand_no,
        reason,
        new_chips,
        if match_over { " - MATCH OVER" } else { "" }
    );
    publish_update(covenant_id);
}

// ── handlers ────────────────────────────────────────────────────────────────

/// GET /poker/:id/state : everything public about the match + current hand.
async fn state_handler(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
    let Some((p1, p2, sg_status)) = seats(&db, &covenant_id) else {
        return Json(json!({"match": null, "hand": null, "last_result": null}));
    };
    let (chips1, chips2, hand_no, button, status) =
        match_row(&db, &covenant_id).unwrap_or((START_CHIPS, START_CHIPS, 1, 0, "active".into()));

    let last_result: Option<serde_json::Value> = crate::db::conn_or_log(&db, "poker::state_handler::last_result")
        .and_then(|conn| {
            conn.query_row(
                "SELECT result FROM poker_hands WHERE covenant_id = ?1 AND result IS NOT NULL \
                 ORDER BY hand_no DESC LIMIT 1",
                params![covenant_id],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .and_then(|s| serde_json::from_str(&s).ok());

    let hand_json = hand_row(&db, &covenant_id, hand_no).and_then(
        |(seed, commitment, phase, actions_raw, result, c1s, c2s, hbtn)| {
            if result.is_some() || phase == "ended" {
                return None; // ended hands surface via last_result
            }
            let actions: Vec<PAction> = serde_json::from_str(&actions_raw).unwrap_or_default();
            let st = replay([c1s, c2s], hbtn as u8, &actions).ok()?;
            let deck = shuffled_deck(&seed);
            let reveal_n: usize = if st.all_in_runout {
                5
            } else {
                [0usize, 3, 4, 5][st.street as usize]
            };
            let board: Vec<String> = deck[4..4 + reveal_n].iter().map(|&c| card_str(c)).collect();
            let street_name = ["preflop", "flop", "turn", "river"][st.street as usize];
            Some(json!({
                "hand_no": hand_no,
                "commitment": commitment,
                "street": street_name,
                "board": board,
                "pot": st.total_pot(),
                "committed": st.committed,
                "stacks": st.stacks,
                "to_act": st.to_act,
                "current_bet": st.current_bet,
                "min_raise_to": st.min_raise_to,
                "button": hbtn,
                "actions": actions,
                "all_in_runout": st.all_in_runout,
            }))
        },
    );

    Json(json!({
        "match": {
            "players": [p1, p2],
            "game_status": sg_status,
            "chips": [chips1, chips2],
            "hand_no": hand_no,
            "button": button,
            "status": status,
            "start_chips": START_CHIPS,
            "blinds": [SMALL_BLIND, BIG_BLIND],
        },
        "hand": hand_json,
        "last_result": last_result,
    }))
}

/// GET /poker/:id/challenge?address= : nonce to sign for a table session.
async fn challenge_handler(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let address = q.get("address").cloned().unwrap_or_default();
    if address.is_empty() {
        return Json(json!({"success": false, "error": "address required"}));
    }
    let nonce = uuid::Uuid::new_v4().to_string();
    let message = format!("covex-poker:{}:{}", covenant_id, nonce);
    {
        // The nonce MUST be persisted for the later session step to succeed, so on pool
        // exhaustion fail closed with a clear error instead of panicking or handing back a nonce
        // that was never stored.
        let Some(conn) = crate::db::conn_or_log(&db, "poker::challenge_handler") else {
            return Json(
                json!({"success": false, "error": "service busy, please retry the challenge"}),
            );
        };
        let _ = conn.execute("DELETE FROM poker_nonces WHERE expires <= unixepoch()", []);
        let _ = conn.execute(
            "INSERT INTO poker_nonces (nonce, covenant_id, address, expires) \
             VALUES (?1, ?2, ?3, unixepoch() + 600)",
            params![nonce, covenant_id, address],
        );
    }
    Json(json!({"success": true, "nonce": nonce, "message": message}))
}

#[derive(serde::Deserialize)]
struct SessionReq {
    address: String,
    signature: String,
    nonce: String,
}

/// POST /poker/:id/session : verify the signed challenge, mint a table token.
async fn session_handler(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<SessionReq>,
) -> Json<serde_json::Value> {
    let Some((p1, p2, _)) = seats(&db, &covenant_id) else {
        return Json(
            json!({"success": false, "error": "no poker match for this covenant; take a seat first"}),
        );
    };
    if seat_of(&req.address, &p1, &p2).is_none() {
        return Json(json!({"success": false, "error": "this address is not seated at the table"}));
    }
    // consume the nonce (single use). On pool exhaustion fail CLOSED: if we cannot atomically
    // delete (consume) the nonce, we must not treat it as consumed, so nonce_ok stays false and
    // the caller is told to request a fresh challenge.
    let nonce_ok = match crate::db::conn_or_log(&db, "poker::session_handler::nonce") {
        Some(conn) => {
            conn.execute(
                "DELETE FROM poker_nonces WHERE nonce = ?1 AND covenant_id = ?2 AND address = ?3 \
                 AND expires > unixepoch()",
                params![req.nonce, covenant_id, req.address],
            )
            .unwrap_or(0)
                == 1
        }
        None => false,
    };
    if !nonce_ok {
        return Json(
            json!({"success": false, "error": "unknown or expired challenge; request a new one"}),
        );
    }
    let message = format!("covex-poker:{}:{}", covenant_id, req.nonce);
    match crate::kaspa_msg::verify_message(&req.address, &message, &req.signature) {
        Ok(true) => {}
        Ok(false) => {
            return Json(json!({"success": false, "error": "signature does not match the address"}))
        }
        Err(e) => {
            return Json(json!({"success": false, "error": format!("signature error: {}", e)}))
        }
    }
    let token = uuid::Uuid::new_v4().to_string();
    {
        // The session token MUST be persisted or the caller holds a token the server never
        // recorded (every later call would 'invalid session'). On pool exhaustion fail closed
        // with a clear error instead of panicking.
        let Some(conn) = crate::db::conn_or_log(&db, "poker::session_handler::mint") else {
            return Json(
                json!({"success": false, "error": "service busy, please retry the session"}),
            );
        };
        let _ = conn.execute(
            "DELETE FROM poker_sessions WHERE expires <= unixepoch()",
            [],
        );
        let _ = conn.execute(
            "INSERT INTO poker_sessions (token, covenant_id, address, expires) \
             VALUES (?1, ?2, ?3, unixepoch() + 86400)",
            params![token, covenant_id, req.address],
        );
    }
    Json(json!({"success": true, "token": token}))
}

#[derive(serde::Deserialize)]
struct TokenReq {
    token: String,
}

/// POST /poker/:id/hole : the caller's two hole cards (signed session only).
async fn hole_handler(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<TokenReq>,
) -> Json<serde_json::Value> {
    let Some(addr) = token_address(&db, &covenant_id, &req.token) else {
        return Json(json!({"success": false, "error": "invalid or expired table session"}));
    };
    let Some((p1, p2, _)) = seats(&db, &covenant_id) else {
        return Json(json!({"success": false, "error": "no poker match"}));
    };
    let Some(seat) = seat_of(&addr, &p1, &p2) else {
        return Json(json!({"success": false, "error": "not seated"}));
    };
    let Some((_, _, hand_no, _, _)) = match_row(&db, &covenant_id) else {
        return Json(json!({"success": false, "error": "no hand dealt yet"}));
    };
    let Some((seed, _, phase, _, result, _, _, _)) = hand_row(&db, &covenant_id, hand_no) else {
        return Json(json!({"success": false, "error": "no hand dealt yet"}));
    };
    if result.is_some() || phase == "ended" {
        return Json(json!({"success": false, "error": "hand already ended"}));
    }
    let deck = shuffled_deck(&seed);
    let holes = if seat == 0 {
        [deck[0], deck[2]]
    } else {
        [deck[1], deck[3]]
    };
    Json(json!({
        "success": true,
        "seat": seat,
        "hole": [card_str(holes[0]), card_str(holes[1])],
        "hand_no": hand_no,
    }))
}

/// POST /poker/:id/deal : start the next hand (either seated player).
async fn deal_handler(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<TokenReq>,
) -> Json<serde_json::Value> {
    let Some(addr) = token_address(&db, &covenant_id, &req.token) else {
        return Json(json!({"success": false, "error": "invalid or expired table session"}));
    };
    let Some((p1, p2, sg_status)) = seats(&db, &covenant_id) else {
        return Json(json!({"success": false, "error": "no poker match"}));
    };
    if seat_of(&addr, &p1, &p2).is_none() {
        return Json(json!({"success": false, "error": "not seated"}));
    }
    if sg_status != "active" || p2.is_empty() {
        return Json(json!({"success": false, "error": "both seats must be filled first"}));
    }

    {
        // Match row MUST be initialized before we can deal; fail closed on pool exhaustion.
        let Some(conn) = crate::db::conn_or_log(&db, "poker::deal_handler::init") else {
            return Json(json!({"success": false, "error": "service busy, please retry the deal"}));
        };
        let _ = conn.execute(
            "INSERT OR IGNORE INTO poker_matches (covenant_id, chips1, chips2, hand_no, button, status) \
             VALUES (?1, ?2, ?2, 1, 0, 'active')",
            params![covenant_id, START_CHIPS],
        );
    }
    let Some((chips1, chips2, hand_no, button, status)) = match_row(&db, &covenant_id) else {
        return Json(json!({"success": false, "error": "match init failed"}));
    };
    if status == "finished" {
        return Json(json!({"success": false, "error": "match is over"}));
    }
    if hand_row(&db, &covenant_id, hand_no)
        .map(|h| h.4.is_none() && h.2 != "ended")
        .unwrap_or(false)
    {
        return Json(json!({"success": false, "error": "a hand is already in progress"}));
    }

    let seed = {
        use rand::RngCore;
        let mut b = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut b);
        hex::encode(b)
    };
    let commitment = hand_commitment(&seed, &covenant_id, hand_no);
    let inserted = {
        // The hand row MUST be persisted to deal; on pool exhaustion fail closed with a clear
        // 'busy' error rather than panicking or masquerading as 'already in progress'.
        let Some(conn) = crate::db::conn_or_log(&db, "poker::deal_handler::hand") else {
            return Json(json!({"success": false, "error": "service busy, please retry the deal"}));
        };
        conn.execute(
            "INSERT OR IGNORE INTO poker_hands \
             (covenant_id, hand_no, seed, commitment, phase, actions, chips1_start, chips2_start, button) \
             VALUES (?1, ?2, ?3, ?4, 'preflop', '[]', ?5, ?6, ?7)",
            params![covenant_id, hand_no, seed, commitment, chips1, chips2, button],
        )
        .unwrap_or(0)
    };
    if inserted == 0 {
        return Json(json!({"success": false, "error": "a hand is already in progress"}));
    }

    // blinds may put a short stack straight all-in: settle immediately if so
    if let Ok(st) = replay([chips1, chips2], button as u8, &[]) {
        settle_if_over(&db, &covenant_id, hand_no, &seed, button as u8, &st);
    }

    info!(
        "Poker[{}]: dealt hand {} (commitment {}...)",
        &covenant_id[..16.min(covenant_id.len())],
        hand_no,
        &commitment[..16]
    );
    publish_update(&covenant_id);
    Json(json!({"success": true, "hand_no": hand_no, "commitment": commitment}))
}

#[derive(serde::Deserialize)]
struct ActionReq {
    token: String,
    act: String,
    #[serde(default)]
    amount: i64,
}

/// POST /poker/:id/action : check / call / bet / raise / fold.
async fn action_handler(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<ActionReq>,
) -> Json<serde_json::Value> {
    let Some(addr) = token_address(&db, &covenant_id, &req.token) else {
        return Json(json!({"success": false, "error": "invalid or expired table session"}));
    };
    let Some((p1, p2, _)) = seats(&db, &covenant_id) else {
        return Json(json!({"success": false, "error": "no poker match"}));
    };
    let Some(seat) = seat_of(&addr, &p1, &p2) else {
        return Json(json!({"success": false, "error": "not seated"}));
    };
    let Some((_, _, hand_no, _, match_status)) = match_row(&db, &covenant_id) else {
        return Json(json!({"success": false, "error": "no hand in progress"}));
    };

    // resign concedes the whole MATCH (folding only concedes the hand)
    if req.act == "resign" {
        if match_status == "finished" {
            return Json(json!({"success": false, "error": "match is already over"}));
        }
        let winner = if seat == 0 { "black" } else { "white" };
        {
            // Resign concedes the whole match: the finish MUST be recorded. On pool exhaustion
            // fail closed with a clear error instead of panicking; the caller can retry.
            let Some(conn) = crate::db::conn_or_log(&db, "poker::action_handler::resign") else {
                return Json(
                    json!({"success": false, "error": "service busy, please retry the resign"}),
                );
            };
            let _ = conn.execute(
                "UPDATE poker_matches SET status = 'finished', \
                 chips1 = CASE WHEN ?1 = 0 THEN 0 ELSE chips1 END, \
                 chips2 = CASE WHEN ?1 = 1 THEN 0 ELSE chips2 END, \
                 updated_at = unixepoch() WHERE covenant_id = ?2",
                params![seat as i64, covenant_id],
            );
            let _ = conn.execute(
                "UPDATE skill_games SET status = 'finished', winner = ?1, updated_at = unixepoch() \
                 WHERE covenant_id = ?2",
                params![winner, covenant_id],
            );
            // close any in-progress hand record honestly (seed revealed)
            let _ = conn.execute(
                "UPDATE poker_hands SET phase = 'ended', \
                 result = json_object('hand_no', hand_no, 'reason', 'resign', 'winner_seat', ?1, \
                                      'seed', seed, 'commitment', commitment, 'match_over', json('true')) \
                 WHERE covenant_id = ?2 AND hand_no = ?3 AND result IS NULL",
                params![(1 - seat) as i64, covenant_id, hand_no],
            );
        }
        info!(
            "Poker[{}]: seat {} resigned the match",
            &covenant_id[..16.min(covenant_id.len())],
            seat
        );
        publish_update(&covenant_id);
        return Json(json!({"success": true, "resigned": true}));
    }

    let Some((seed, _, phase, actions_raw, result, c1s, c2s, hbtn)) =
        hand_row(&db, &covenant_id, hand_no)
    else {
        return Json(json!({"success": false, "error": "no hand in progress"}));
    };
    if result.is_some() || phase == "ended" {
        return Json(json!({"success": false, "error": "hand already ended; deal the next one"}));
    }

    let mut actions: Vec<PAction> = serde_json::from_str(&actions_raw).unwrap_or_default();
    actions.push(PAction {
        seat,
        act: req.act.clone(),
        amount: req.amount,
    });
    let st = match replay([c1s, c2s], hbtn as u8, &actions) {
        Ok(s) => s,
        Err(e) => return Json(json!({"success": false, "error": e})),
    };

    // persist the validated log; the WHERE actions = old guards concurrency
    let saved = {
        // The action MUST persist; on pool exhaustion fail closed with a clear 'busy' error
        // rather than panicking or reporting the concurrency-conflict message below.
        let Some(conn) = crate::db::conn_or_log(&db, "poker::action_handler::persist") else {
            return Json(
                json!({"success": false, "error": "service busy, please retry the action"}),
            );
        };
        conn.execute(
            "UPDATE poker_hands SET actions = ?1 \
             WHERE covenant_id = ?2 AND hand_no = ?3 AND actions = ?4 AND result IS NULL",
            params![
                serde_json::to_string(&actions).unwrap_or_else(|_| "[]".into()),
                covenant_id,
                hand_no,
                actions_raw
            ],
        )
        .unwrap_or(0)
    };
    if saved == 0 {
        return Json(
            json!({"success": false, "error": "table state changed; refresh and try again"}),
        );
    }

    settle_if_over(&db, &covenant_id, hand_no, &seed, hbtn as u8, &st);
    publish_update(&covenant_id);
    Json(json!({"success": true}))
}

// ── tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn c(s: &str) -> u8 {
        let b: Vec<char> = s.chars().collect();
        let rank = RANK_CH.iter().position(|&r| r == b[0]).unwrap() as u8;
        let suit = SUIT_CH.iter().position(|&x| x == b[1]).unwrap() as u8;
        suit * 13 + rank
    }
    fn seven(cards: [&str; 7]) -> (u8, Vec<u8>) {
        let v: Vec<u8> = cards.iter().map(|s| c(s)).collect();
        evaluate7(&v.try_into().unwrap())
    }

    #[test]
    fn evaluator_categories() {
        assert_eq!(seven(["Ah", "Kh", "Qh", "Jh", "Th", "2c", "3d"]).0, 8);
        assert_eq!(seven(["Ah", "Ac", "Ad", "As", "Th", "2c", "3d"]).0, 7);
        assert_eq!(seven(["Ah", "Ac", "Ad", "Ts", "Th", "2c", "3d"]).0, 6);
        assert_eq!(seven(["Ah", "9h", "5h", "Jh", "Th", "2c", "3d"]).0, 5);
        assert_eq!(seven(["9c", "8h", "7d", "6s", "5h", "Ac", "Ad"]).0, 4);
        assert_eq!(seven(["Ah", "2c", "3d", "4s", "5h", "9c", "Td"]).0, 4); // wheel
        assert_eq!(seven(["Ah", "Ac", "Ad", "9s", "Th", "2c", "3d"]).0, 3);
        assert_eq!(seven(["Ah", "Ac", "Td", "Ts", "4h", "2c", "3d"]).0, 2);
        assert_eq!(seven(["Ah", "Ac", "Td", "9s", "4h", "2c", "3d"]).0, 1);
        assert_eq!(seven(["Ah", "Kc", "Td", "9s", "4h", "2c", "3d"]).0, 0);
    }

    #[test]
    fn evaluator_kickers_and_ties() {
        let a = seven(["Ah", "Ac", "Td", "Ts", "Kh", "2c", "3d"]);
        let b = seven(["Ad", "As", "Tc", "Th", "Qh", "2d", "3c"]);
        assert!(a > b); // king kicker beats queen kicker on the same two pair
        let x = seven(["2c", "3d", "Ah", "Kh", "Qh", "Jh", "Th"]);
        let y = seven(["4s", "5c", "Ah", "Kh", "Qh", "Jh", "Th"]);
        assert_eq!(x, y); // board plays: split
    }

    #[test]
    fn shuffle_is_deterministic_and_complete() {
        let d1 = shuffled_deck("test-seed");
        assert_eq!(d1, shuffled_deck("test-seed"));
        assert_ne!(d1, shuffled_deck("other-seed"));
        let mut sorted = d1;
        sorted.sort_unstable();
        assert_eq!(sorted.to_vec(), (0u8..52).collect::<Vec<u8>>());
    }

    #[test]
    fn betting_full_hand_to_showdown() {
        // button = seat 0 (SB); seat 1 is BB and acts first postflop
        let acts = vec![
            PAction {
                seat: 0,
                act: "raise".into(),
                amount: 6,
            },
            PAction {
                seat: 1,
                act: "call".into(),
                amount: 0,
            },
            PAction {
                seat: 1,
                act: "check".into(),
                amount: 0,
            }, // flop
            PAction {
                seat: 0,
                act: "bet".into(),
                amount: 8,
            },
            PAction {
                seat: 1,
                act: "call".into(),
                amount: 0,
            },
            PAction {
                seat: 1,
                act: "check".into(),
                amount: 0,
            }, // turn
            PAction {
                seat: 0,
                act: "check".into(),
                amount: 0,
            },
            PAction {
                seat: 1,
                act: "bet".into(),
                amount: 20,
            }, // river
            PAction {
                seat: 0,
                act: "call".into(),
                amount: 0,
            },
        ];
        let st = replay([100, 100], 0, &acts).unwrap();
        assert_eq!(st.over, Some((2, "showdown")));
        assert_eq!(st.total_pot(), 68);
        assert_eq!(st.stacks, [66, 66]);
    }

    #[test]
    fn betting_rejects_illegal() {
        let acts = vec![
            PAction {
                seat: 0,
                act: "raise".into(),
                amount: 6,
            },
            PAction {
                seat: 1,
                act: "check".into(),
                amount: 0,
            },
        ];
        assert!(replay([100, 100], 0, &acts).is_err()); // check facing a raise
        let acts = vec![PAction {
            seat: 1,
            act: "check".into(),
            amount: 0,
        }];
        assert!(replay([100, 100], 0, &acts).is_err()); // out of turn
        let acts = vec![PAction {
            seat: 0,
            act: "raise".into(),
            amount: 3,
        }];
        assert!(replay([100, 100], 0, &acts).is_err()); // below min raise
    }

    #[test]
    fn betting_fold_and_bb_option() {
        let acts = vec![
            PAction {
                seat: 0,
                act: "call".into(),
                amount: 0,
            }, // SB limp
            PAction {
                seat: 1,
                act: "raise".into(),
                amount: 8,
            },
            PAction {
                seat: 0,
                act: "fold".into(),
                amount: 0,
            },
        ];
        let st = replay([100, 100], 0, &acts).unwrap();
        assert_eq!(st.over, Some((1, "fold")));
        assert_eq!(st.total_pot(), 10); // 2 + 8

        let acts = vec![
            PAction {
                seat: 0,
                act: "call".into(),
                amount: 0,
            },
            PAction {
                seat: 1,
                act: "check".into(),
                amount: 0,
            }, // BB option closes
        ];
        let st = replay([100, 100], 0, &acts).unwrap();
        assert_eq!(st.street, 1);
        assert_eq!(st.to_act, Some(1)); // BB acts first postflop
        assert_eq!(st.pot, 4);
    }

    #[test]
    fn all_in_runout_and_short_call_refund() {
        // even stacks: shove + call runs the board out
        let acts = vec![
            PAction {
                seat: 0,
                act: "raise".into(),
                amount: 100,
            },
            PAction {
                seat: 1,
                act: "call".into(),
                amount: 0,
            },
        ];
        let st = replay([100, 100], 0, &acts).unwrap();
        assert!(st.all_in_runout);
        assert_eq!(st.over, Some((2, "showdown")));
        assert_eq!(st.stacks, [0, 0]);
        assert_eq!(st.total_pot(), 200);

        // short stack calls all-in for less: the excess returns to the shover
        let acts = vec![
            PAction {
                seat: 0,
                act: "raise".into(),
                amount: 100,
            },
            PAction {
                seat: 1,
                act: "call".into(),
                amount: 0,
            },
        ];
        let st = replay([100, 40], 0, &acts).unwrap();
        assert!(st.all_in_runout);
        assert_eq!(st.total_pot(), 80); // 40 effective each
        assert_eq!(st.stacks, [60, 0]); // 60 refunded to the shover
    }
}
