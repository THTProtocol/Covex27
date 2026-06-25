//! Persistent skill games: join, move, and state APIs over the existing
//! skill_games table, with live WebSocket fan-out so opponents and
//! spectators sync in real time. Stakes stay on-chain; this is game-state
//! coordination only and the oracle still signs final outcomes.

use axum::{
    extract::{Path, Query},
    routing::{get, post},
    Extension, Json, Router,
};
use kaspa_addresses::Address;
use rusqlite::params;
use serde_json::json;
use std::collections::HashMap;

use crate::game_engine;
use crate::live;

pub fn games_routes() -> Router {
    Router::new()
        .route("/games", get(list_games))
        .route("/games/:covenant_id", get(get_game))
        .route("/games/:covenant_id/join", post(join_game))
        .route("/games/:covenant_id/move", post(make_move))
        .route("/games/:covenant_id/resign", post(resign_game))
        .route("/games/:covenant_id/claim-timeout", post(claim_timeout))
        .route("/games/:covenant_id/lock-pot", post(lock_pot))
        .route("/games/:covenant_id/submit-pot", post(submit_pot))
        .route("/games/:covenant_id/settle-pot", post(settle_pot))
        .route("/games/:covenant_id/submit-settle", post(submit_settle))
        // De-oracle hashlock settle/refund (DEORACLE_PLAN stage 3): zero server signatures.
        .route(
            "/games/:covenant_id/settle-pot-hashlock",
            post(settle_pot_hashlock),
        )
        .route(
            "/games/:covenant_id/refund-pot-hashlock",
            post(refund_pot_hashlock),
        )
        // On-chain ZK settle (KIP-16 OpZkPrecompile). GATED behind KASPA_ZK_PRECOMPILE_ENABLED,
        // mainnet-rejected. The winner proves the game off-device (a prover service), the chain
        // verifies the Groth16 proof; the server signs nothing.
        .route("/games/:covenant_id/settle-zk", post(settle_zk))
        .route("/games/:covenant_id/lock-channel", post(lock_channel))
        .route(
            "/games/:covenant_id/bind-channel-pot",
            post(bind_channel_pot),
        )
        .route("/games/:covenant_id/settle-channel", post(settle_channel))
        .route("/games/:covenant_id/refund-channel", post(refund_channel))
}

/// A per-seat secret issued to a seated client exactly once (at create for
/// player1, at join for player2). Every move/resign must echo it back, so the
/// opponent - who only knows the public player addresses - cannot forge the
/// victim's moves.
fn gen_seat_token() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// Authorise acting for a seat. Matches the supplied token against the stored
/// one. A NULL/empty stored token means a legacy row created before move-auth
/// existed: we fall back to turn-only enforcement (testnet demos only; every
/// new game is tokenised). A set token that does not match is rejected.
fn check_seat_token(stored: &Option<String>, supplied: &str) -> Result<(), String> {
    match stored {
        Some(t) if !t.is_empty() => {
            if t == supplied {
                Ok(())
            } else {
                Err("invalid or missing move token for this seat - only the seated player (the client that joined) can act for this side".to_string())
            }
        }
        _ => Ok(()),
    }
}

/// Which seat (if any) a supplied token authenticates for.
enum Seat {
    Player1,
    Player2,
}

/// Authorise a money-route caller for a covenant's match by their per-seat token
/// (the same secret make_move/resign require). Fails CLOSED: an empty supplied
/// token is always rejected, and unlike move-auth there is no legacy turn-only
/// fallback - a real pot is never moved without a valid seat token. Returns which
/// seat the token belongs to so refund-channel can additionally restrict to the
/// funder.
fn authorize_money_caller(
    db: &crate::db::Db,
    covenant_id: &str,
    supplied: &str,
) -> Result<Seat, String> {
    if supplied.is_empty() {
        return Err("a valid seat token is required to move funds for this match".to_string());
    }
    let (p1_token, p2_token): (Option<String>, Option<String>) = {
        let conn = db.lock().unwrap();
        conn.query_row(
            "SELECT p1_token, p2_token FROM skill_games WHERE covenant_id = ?1",
            params![covenant_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "no match for this covenant".to_string())?
    };
    // Reuse the exact seat-token matching used by make_move/resign. We require a
    // POSITIVE match against a stored, non-empty token (check_seat_token returns
    // Ok on a NULL/empty stored token, so we gate on that explicitly here to keep
    // the money routes fail-closed).
    if matches!(&p1_token, Some(t) if !t.is_empty())
        && check_seat_token(&p1_token, supplied).is_ok()
    {
        return Ok(Seat::Player1);
    }
    if matches!(&p2_token, Some(t) if !t.is_empty())
        && check_seat_token(&p2_token, supplied).is_ok()
    {
        return Ok(Seat::Player2);
    }
    Err(
        "invalid or missing seat token - only a seated player of this match may move its funds"
            .to_string(),
    )
}

// ── Public thin wrappers for the off-chain channel relay (channel.rs). They expose
// the SAME fail-closed auth and the SAME address->x-only derivation the money routes
// use, so the relay cannot accept a caller or a member the on-chain path would not. ──

/// Authorise a channel-relay caller by seat token. Ok = a seated player of this
/// match; Err = rejected (fail-closed, empty token always rejected). The seat
/// identity is intentionally collapsed to () here: a checkpoint may be advanced by
/// either seated player, and which member a partial sig belongs to is enforced
/// separately by matching the signer x-only against the players.
pub fn authorize_money_caller_pub(
    db: &crate::db::Db,
    covenant_id: &str,
    supplied: &str,
) -> Result<(), String> {
    authorize_money_caller(db, covenant_id, supplied).map(|_| ())
}

/// Derive a schnorr x-only pubkey (hex) from a kaspa address. Same derivation the
/// channel deploy/close uses, so the relay validates members against the exact keys
/// that appear in the on-chain redeem.
pub fn xonly_hex_from_address_pub(addr: &str) -> Result<String, String> {
    xonly_hex_from_address(addr)
}

/// (player1, player2) addresses for a match, or None if the match does not exist.
pub fn game_players_pub(db: &crate::db::Db, covenant_id: &str) -> Option<(String, String)> {
    let game = fetch_game(db, covenant_id)?;
    Some((
        game["player1"].as_str().unwrap_or("").to_string(),
        game["player2"].as_str().unwrap_or("").to_string(),
    ))
}

/// Body for the no-arg money routes (settle-pot, settle-channel, refund-channel):
/// carries the caller's per-seat token so the handler can authorise them.
#[derive(serde::Deserialize)]
struct AuthReq {
    /// Per-seat secret issued at join (see make_move). Required to move funds.
    #[serde(default)]
    token: Option<String>,
}

/// Background sweep: finalise active matches whose side-to-move has run its clock out
/// when neither client called claim-timeout (e.g. both closed the tab). Recorded as
/// end_reason='abandon' - server-timed, so it may settle a real pot to the winner.
pub fn spawn_timeout_sweeper(db: crate::db::Db) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            tick.tick().await;
            let finalized: Vec<String> = {
                let conn = db.lock().unwrap();
                let rows: Vec<(String, String, i64, i64, i64, i64)> = {
                    let mut stmt = match conn.prepare(
                        "SELECT covenant_id, current_turn, p1_time_ms, p2_time_ms, turn_started_at, unixepoch() FROM skill_games WHERE status = 'active' AND turn_started_at > 0",
                    ) {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    stmt.query_map([], |r| {
                        Ok((
                            r.get(0)?,
                            r.get(1)?,
                            r.get(2)?,
                            r.get(3)?,
                            r.get(4)?,
                            r.get(5)?,
                        ))
                    })
                    .map(|it| it.flatten().collect())
                    .unwrap_or_default()
                };
                let mut done = Vec::new();
                for (cid, turn, p1ms, p2ms, started, now) in rows {
                    let elapsed = (now - started).max(0) * 1000;
                    let budget = if turn == "white" { p1ms } else { p2ms };
                    if budget - elapsed <= 0 {
                        let win = if turn == "white" { "black" } else { "white" };
                        let (np1, np2) = if turn == "white" {
                            (0i64, p2ms)
                        } else {
                            (p1ms, 0i64)
                        };
                        if conn
                            .execute(
                                "UPDATE skill_games SET status = 'finished', winner = ?1, end_reason = 'abandon', p1_time_ms = ?2, p2_time_ms = ?3, updated_at = unixepoch() WHERE covenant_id = ?4 AND status = 'active'",
                                params![win, np1, np2, cid],
                            )
                            .is_ok()
                        {
                            done.push(cid);
                        }
                    }
                }
                done
            };
            for cid in finalized {
                let game = fetch_game(&db, &cid);
                live::publish("game_move", json!({"covenant_id": cid, "game": game}));
            }
        }
    });
}

fn row_to_game(row: &rusqlite::Row) -> rusqlite::Result<serde_json::Value> {
    let moves_raw: String = row.get(5)?;
    let moves: serde_json::Value = serde_json::from_str(&moves_raw).unwrap_or_else(|_| json!([]));
    Ok(json!({
        "covenant_id": row.get::<_, String>(0)?,
        "game_type": row.get::<_, String>(1)?,
        "pot_amount_kas": row.get::<_, f64>(2)?,
        "player1": row.get::<_, String>(3)?,
        "player2": row.get::<_, String>(4)?,
        "moves": moves,
        "current_turn": row.get::<_, String>(6)?,
        "winner": row.get::<_, Option<String>>(7)?,
        "status": row.get::<_, String>(8)?,
        "created_at": row.get::<_, i64>(9)?,
        "updated_at": row.get::<_, i64>(10)?,
        // Server-authoritative clocks. The client renders a live countdown by
        // subtracting (server_now - turn_started_at) from the side-to-move's budget.
        "p1_time_ms": row.get::<_, i64>(11)?,
        "p2_time_ms": row.get::<_, i64>(12)?,
        "turn_started_at": row.get::<_, i64>(13)?,
        "end_reason": row.get::<_, Option<String>>(14)?,
        "server_now": row.get::<_, i64>(15)?,
        // On-chain pot state so the client can render the non-custodial money flow honestly:
        // pot_tx is set once a real pot is locked + bound (submit-pot / bind-channel-pot),
        // pot_payout_tx once the winner payout (or refund) has broadcast (submit-settle).
        "pot_tx": row.get::<_, Option<String>>(16)?,
        "pot_payout_tx": row.get::<_, Option<String>>(17)?,
        // Which settlement path the locked pot uses, so the client can pick the right claim flow:
        // "hashlock" = de-oracle referee-reveal (winner spends with their OWN key, no Covex key in
        // the redeem); "oracle_escrow" = legacy Covex co-sign. NULL until a pot is locked.
        "settle_mode": row.get::<_, Option<String>>(18)?,
    }))
}

const GAME_SELECT: &str = "SELECT covenant_id, game_type, pot_amount_kas, player1, player2, moves, current_turn, winner, status, created_at, updated_at, p1_time_ms, p2_time_ms, turn_started_at, end_reason, unixepoch(), pot_tx, pot_payout_tx, settle_mode FROM skill_games";

fn fetch_game(db: &crate::db::Db, covenant_id: &str) -> Option<serde_json::Value> {
    let conn = db.lock().unwrap();
    conn.query_row(
        &format!("{} WHERE covenant_id = ?1", GAME_SELECT),
        params![covenant_id],
        row_to_game,
    )
    .ok()
}

/// Derive a schnorr x-only pubkey (hex) from a kaspa address (its 32-byte payload).
fn xonly_hex_from_address(addr: &str) -> Result<String, String> {
    let a = Address::try_from(addr).map_err(|e| format!("invalid address '{addr}': {e}"))?;
    let p = a.payload.as_slice();
    if p.len() != 32 {
        return Err(format!(
            "address '{addr}' is not a 32-byte schnorr key (payload {} bytes)",
            p.len()
        ));
    }
    Ok(hex::encode(p))
}

/// Default CSV refund window (in DAA / block units) for a hashlock pot when the caller
/// does not pass `refund_after_blocks`. The funder may reclaim the stake once the pot UTXO
/// has aged this many units (BIP68, node-enforced) if the referee never reveals a secret.
const DEFAULT_HASHLOCK_REFUND_BLOCKS: u64 = 720;

/// POST /games/:id/lock-pot {token, stake_kas, network?, settle_mode?, refund_after_blocks?} :
/// PREPARE a real on-chain pot for this match. NON-CUSTODIAL: returns the UNSIGNED funding tx +
/// sighash for player1's browser wallet to sign (no use_dev_mode, the server never holds
/// player1's key). player1 signs and POSTs {session_id, signature_hex, token} to
/// /games/:id/submit-pot, which broadcasts and links the pot to this match.
///
/// `settle_mode` selects the settlement path (DEORACLE_PLAN stage 2):
///   * "oracle_escrow" (DEFAULT, legacy): an oracle_escrow covenant [oracle, player1, player2].
///     The chain releases the pot ONLY to the oracle-declared winner; the Covex oracle key
///     co-signs the payout (settle-pot/submit-settle). UNCHANGED from before.
///   * "hashlock" (NEW, de-oracle): a binary_oracle_select covenant with NO Covex key and NO
///     referee key in the redeem - only the two player keys, two referee HASHLOCKS, a CSV
///     refund to the funder (player1). The referee reveals the winner's secret at settle and
///     the WINNER spends with their OWN key (settle-pot-hashlock + the non-custodial spend).
async fn lock_pot(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    // Auth: only a seated player (holding this match's seat token) may lock funds.
    let token = req.get("token").and_then(|v| v.as_str()).unwrap_or("");
    if let Err(e) = authorize_money_caller(&db, &covenant_id, token) {
        return Json(json!({ "success": false, "error": e }));
    }
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    let p2 = game["player2"].as_str().unwrap_or("").to_string();
    if p1.is_empty() || p2.is_empty() {
        return Json(
            json!({ "success": false, "error": "game needs two players before locking a pot" }),
        );
    }
    let stake = req.get("stake_kas").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if !(stake > 0.0) {
        return Json(json!({ "success": false, "error": "stake_kas must be > 0" }));
    }
    let net = req
        .get("network")
        .and_then(|v| v.as_str())
        .unwrap_or("testnet-12")
        .to_string();
    // settle_mode (DEORACLE_PLAN stage 4 FLIP): NEW game pots default to the de-oracle "hashlock"
    // path (binary_oracle_select, NO Covex key in the redeem). A caller may still explicitly opt a
    // NEW pot back onto the legacy Covex-oracle co-sign path by passing settle_mode="oracle_escrow"
    // (kept working for migration / fallback). Anything other than a recognized value defaults to
    // hashlock. ALREADY-DEPLOYED oracle_escrow pots are unaffected: their settle path is read from
    // the stored row (load_hashlock_pot / settle_pot), not from this default.
    let settle_mode = req
        .get("settle_mode")
        .and_then(|v| v.as_str())
        .map(|s| if s == "oracle_escrow" { "oracle_escrow" } else { "hashlock" })
        .unwrap_or("hashlock")
        .to_string();
    // MAINNET FREEZE (belt-and-braces, independent of the Toccata node gate): the legacy
    // oracle_escrow path puts the Covex oracle key IN the redeem, so it must never lock real
    // money. lock_pot routes through prepare_deploy_handler, which does NOT carry the
    // p2sh_deploy_handler oracle freeze, so we freeze the legacy game lock here: on mainnet only
    // the de-oracle hashlock path (no Covex key in the redeem) may lock a new game pot.
    if net.starts_with("mainnet") && settle_mode != "hashlock" {
        return Json(json!({ "success": false, "error": "on mainnet a game pot must use the de-oracle hashlock settlement (no Covex key in the redeem); the legacy oracle_escrow co-sign path is frozen on mainnet" }));
    }
    let p1x = match xonly_hex_from_address(&p1) {
        Ok(x) => x,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };
    let p2x = match xonly_hex_from_address(&p2) {
        Ok(x) => x,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };

    // Build the PrepareDeployRequest. Legacy = oracle_escrow [oracle, p1, p2]; new = a
    // binary_oracle_select with referee hashlocks and NO co-sign key in the redeem.
    let (preq_json, mode_for_next): (serde_json::Value, &str) = if settle_mode == "hashlock" {
        // DE-ORACLE PATH. Commit the referee's two outcome HASHLOCKS (no secrets, no key in
        // the redeem). The domain is the match covenant_id (the stable per-pot id this match
        // is keyed on), so a secret for match X can never satisfy match Y's hash. Outcome 0 =
        // player1 wins (winner_a), outcome 1 = player2 wins (winner_b). Refund = the funder
        // (player1), reclaimable after the CSV window if the referee stays silent.
        let hash_a = crate::referee::outcome_hashlock_hex(&net, &covenant_id, 0);
        let hash_b = crate::referee::outcome_hashlock_hex(&net, &covenant_id, 1);
        let refund_blocks = req
            .get("refund_after_blocks")
            .and_then(|v| v.as_u64())
            .filter(|d| *d > 0)
            .unwrap_or(DEFAULT_HASHLOCK_REFUND_BLOCKS);
        (
            json!({
                "network": net, "deployer_addr": p1, "stake_kas": stake,
                "redeem": {
                    "kind": "binary_oracle_select",
                    "hash_a_hex": hash_a,
                    "hash_b_hex": hash_b,
                    "pubkeys_hex": [p1x, p2x],
                    "lock_daa": refund_blocks,
                    "refund_pubkey_hex": p1x
                }
            }),
            "hashlock",
        )
    } else {
        // LEGACY PATH (unchanged): oracle_escrow [oracle, player1, player2].
        (
            json!({
                "network": net, "deployer_addr": p1, "stake_kas": stake,
                "redeem": { "kind": "oracle_escrow", "pubkeys_hex": [p1x, p2x] }
            }),
            "oracle_escrow",
        )
    };

    // NON-CUSTODIAL: build the UNSIGNED funding tx and return its sighash for player1's browser
    // wallet to sign. No use_dev_mode, so the server never holds player1's key. The funder signs
    // `sighash` and POSTs {session_id, signature_hex, token} to /games/:id/submit-pot, which
    // broadcasts and links pot_tx (+ settle_mode + match_id for the hashlock path) to this match.
    let preq: crate::covenant_builder::PrepareDeployRequest =
        match serde_json::from_value(preq_json) {
            Ok(r) => r,
            Err(e) => {
                return Json(
                    json!({ "success": false, "error": format!("build prepare-deploy request: {e}") }),
                )
            }
        };
    let mut v = crate::covenant_builder::prepare_deploy_handler(Extension(db.clone()), Json(preq))
        .await
        .0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        // SOUNDNESS ASSERTION (DEORACLE_PLAN stage 2): for the hashlock path the resulting
        // redeem MUST embed NEITHER the Covex oracle xonly NOR the referee xonly - only the two
        // player keys, the two referee hashlocks, and the funder refund key. If either control
        // key leaked into the redeem we refuse to proceed (the pot would not be de-oracled).
        if mode_for_next == "hashlock" {
            if let Some(redeem_hex) = v.get("redeem_script_hex").and_then(|s| s.as_str()) {
                let oracle_x = crate::oracle::oracle_xonly_pubkey_hex();
                let referee_x = crate::referee::referee_xonly_pubkey_hex(&net);
                let lower = redeem_hex.to_lowercase();
                if lower.contains(&oracle_x.to_lowercase()) {
                    return Json(json!({ "success": false, "error": "internal error: hashlock pot redeem unexpectedly embeds the Covex oracle key; refusing to lock a non-de-oracled pot" }));
                }
                if lower.contains(&referee_x.to_lowercase()) {
                    return Json(json!({ "success": false, "error": "internal error: hashlock pot redeem unexpectedly embeds the referee key; the referee must never be a covenant signer" }));
                }
            }
        }
        // Record the chosen settle_mode in the response so the client knows which settle
        // endpoint to call after funding. submit-pot persists it on the row.
        v["settle_mode"] = json!(mode_for_next);
        v["match_id"] = json!(covenant_id);
        let settle_ep = if mode_for_next == "hashlock" {
            "settle-pot-hashlock"
        } else {
            "submit-settle"
        };
        v["next"] = json!(format!(
            "Sign `sighash` (BIP340 Schnorr) with player1's wallet, then POST {{session_id, signature_hex, token, settle_mode}} to /games/{covenant_id}/submit-pot to broadcast and link the pot. Settle later via /games/{covenant_id}/{settle_ep}."
        ));
    }
    Json(v)
}

/// POST /games/:id/submit-pot {token, session_id, signature_hex, settle_mode?} : broadcast the
/// player1-signed funding tx (non-custodial; the server never held player1's key) and LINK the
/// resulting pot to this match so the settle money gate (game_pot_outcome) can resolve it.
/// `settle_mode` (echoed from lock-pot) records which settle path the pot uses: the legacy
/// "oracle_escrow" co-sign, or the new "hashlock" referee-reveal. For "hashlock", match_id is
/// bound to this match's covenant_id (the referee hashlock domain) so settle can re-derive it.
async fn submit_pot(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    // Auth: only a seated player (holding this match's seat token) may move funds.
    let token = req.get("token").and_then(|v| v.as_str()).unwrap_or("");
    if let Err(e) = authorize_money_caller(&db, &covenant_id, token) {
        return Json(json!({ "success": false, "error": e }));
    }
    let session_id = req
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let signature_hex = req
        .get("signature_hex")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if session_id.is_empty() || signature_hex.is_empty() {
        return Json(
            json!({ "success": false, "error": "submit-pot requires session_id and signature_hex from lock-pot" }),
        );
    }
    let sreq: crate::covenant_builder::SubmitDeployRequest = match serde_json::from_value(json!({
        "session_id": session_id, "signature_hex": signature_hex
    })) {
        Ok(r) => r,
        Err(e) => {
            return Json(
                json!({ "success": false, "error": format!("build submit-deploy request: {e}") }),
            )
        }
    };
    let v = crate::covenant_builder::submit_deploy_handler(Extension(db.clone()), Json(sreq))
        .await
        .0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        if let Some(tx) = v.get("deploy_tx_id").and_then(|t| t.as_str()) {
            // Persist the LOCKED amount the node accepted (from the broadcast result), not a
            // client-claimed stake, so the recorded pot matches what is actually on-chain.
            let kas = v.get("locked_kas").and_then(|k| k.as_f64()).unwrap_or(0.0);
            // Record the settle path. "hashlock" binds match_id to this match's covenant_id
            // (the referee hashlock domain) so settle-pot-hashlock can re-derive the winner's
            // secret. Only an explicit "oracle_escrow" stays on the legacy Covex-oracle co-sign
            // path (match_id left NULL). settle_mode is echoed from lock-pot; since stage 4 flips
            // the NEW-pot default to hashlock, default here to hashlock too so a client that omits
            // it on submit-pot labels the row to match the hashlock covenant lock-pot built.
            let settle_mode = req
                .get("settle_mode")
                .and_then(|v| v.as_str())
                .map(|s| if s == "oracle_escrow" { "oracle_escrow" } else { "hashlock" })
                .unwrap_or("hashlock")
                .to_string();
            let conn = db.lock().unwrap();
            if settle_mode == "hashlock" {
                let _ = conn.execute(
                    "UPDATE skill_games SET pot_tx = ?1, pot_amount_kas = ?2, settle_mode = 'hashlock', match_id = ?3, updated_at = unixepoch() WHERE covenant_id = ?3",
                    params![tx, kas, covenant_id],
                );
            } else {
                let _ = conn.execute(
                    "UPDATE skill_games SET pot_tx = ?1, pot_amount_kas = ?2, settle_mode = 'oracle_escrow', updated_at = unixepoch() WHERE covenant_id = ?3",
                    params![tx, kas, covenant_id],
                );
            }
        }
    }
    Json(v)
}

/// POST /games/:id/settle-pot {token} : PREPARE the winner payout for the locked pot.
/// NON-CUSTODIAL: the winner is re-derived server-side (MONEY GATE below), then the oracle
/// verifies the outcome and contributes ONLY its half of the 2-of-2 over a sighash that
/// commits the single output paying that winner. This returns that sighash + the oracle
/// partial-signature so the WINNER signs their half in their browser (no use_dev_mode, no
/// winner key ever reaches the server); the winner then POSTs {session_id, signature_hex,
/// token} to /games/:id/submit-settle to broadcast.
async fn settle_pot(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(auth): Json<AuthReq>,
) -> Json<serde_json::Value> {
    // Auth: only a seated player (holding this match's seat token) may settle.
    if let Err(e) = authorize_money_caller(&db, &covenant_id, auth.token.as_deref().unwrap_or("")) {
        return Json(json!({ "success": false, "error": e }));
    }
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let winner = game["winner"].as_str().unwrap_or("").to_string();
    if winner.is_empty() {
        return Json(json!({ "success": false, "error": "game has no winner yet" }));
    }
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    let p2 = game["player2"].as_str().unwrap_or("").to_string();
    let gt = game["game_type"].as_str().unwrap_or("chess").to_string();

    let (pot_tx, net): (Option<String>, String) = {
        let conn = db.lock().unwrap();
        let pot: Option<String> = conn
            .query_row(
                "SELECT pot_tx FROM skill_games WHERE covenant_id = ?1",
                params![covenant_id],
                |r| r.get(0),
            )
            .ok()
            .flatten();
        let net = pot
            .as_ref()
            .and_then(|t| {
                conn.query_row(
                    "SELECT network FROM p2sh_covenants WHERE tx_id = ?1",
                    params![t],
                    |r| r.get::<_, String>(0),
                )
                .ok()
            })
            .unwrap_or_else(|| "testnet-12".to_string());
        (pot, net)
    };
    let pot_tx = match pot_tx {
        Some(t) if !t.is_empty() => t,
        _ => {
            return Json(
                json!({ "success": false, "error": "no pot locked for this game (call lock-pot first)" }),
            )
        }
    };

    let wl = winner.to_lowercase();
    let stored_side: u32 = if winner == p1 || wl == "white" || wl == "player1" {
        0
    } else if winner == p2 || wl == "black" || wl == "player2" {
        1
    } else {
        return Json(
            json!({ "success": false, "error": format!("cannot map winner '{winner}' to player1/player2") }),
        );
    };
    // MONEY GATE (defense in depth, mirrors settle-channel): do NOT trust the stored
    // `winner` string to pick the destination. Re-derive the winning side from the
    // server-authoritative engine replay (game_pot_outcome) and pay strictly to THAT
    // side, refusing on any mismatch with the recorded winner. game_pot_outcome FAILS
    // CLOSED on anything that is not an engine-decisive board or a server-timed timeout,
    // so a poisoned `winner` field can never redirect the pot.
    let outcome: u32 = match crate::covenant_builder::game_pot_outcome(&db, &pot_tx) {
        crate::covenant_builder::GamePot::Verified(o) if o == stored_side => o,
        crate::covenant_builder::GamePot::Verified(o) => {
            return Json(
                json!({ "success": false, "error": format!("recorded winner maps to side {stored_side} but the server-verified result is side {o}; refusing to settle to the wrong player") }),
            );
        }
        crate::covenant_builder::GamePot::Rejected(msg) => {
            return Json(
                json!({ "success": false, "error": format!("pot settle refused: {msg}") }),
            );
        }
        crate::covenant_builder::GamePot::NotAGamePot => {
            return Json(
                json!({ "success": false, "error": "this pot is not linked to a server-verified match; refusing to settle" }),
            );
        }
    };
    let dest = if outcome == 0 { &p1 } else { &p2 };

    // NON-CUSTODIAL oracle co-sign: run the SAME outcome gate as the custodial handler
    // (it re-derives the game pot via game_pot_outcome and cross-checks requested_outcome),
    // but produce ONLY the oracle's partial signature over the winner-payout sighash. No
    // use_dev_mode: the winner signs their half in the browser. The destination is the
    // re-derived `dest` above, so the oracle commits to paying exactly the verified winner.
    let preq: crate::covenant_builder::PrepareOraclePayoutRequest = match serde_json::from_value(
        json!({
            "network": net, "deploy_tx_id": pot_tx, "destination_addr": dest,
            "circuit_type": format!("{}_v1", gt), "proof": {}, "public_inputs": [], "requested_outcome": outcome
        }),
    ) {
        Ok(r) => r,
        Err(e) => {
            return Json(
                json!({ "success": false, "error": format!("build oracle-payout prepare request: {e}") }),
            )
        }
    };
    let mut v =
        crate::covenant_builder::prepare_oracle_payout_handler(Extension(db.clone()), Json(preq))
            .await
            .0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        v["next"] = json!(format!(
            "Sign `sighash` (BIP340 Schnorr) with the winner's wallet, then POST {{session_id, signature_hex, token}} to /games/{covenant_id}/submit-settle to broadcast. The server contributed only the oracle half."
        ));
    }
    Json(v)
}

/// POST /games/:id/submit-settle {token, session_id, signature_hex} : combine the winner's
/// browser signature with the oracle co-signature minted by settle-pot and broadcast the
/// payout. The server contributed only the oracle half; the winner key never reaches it.
/// Records pot_payout_tx on success.
async fn submit_settle(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    // Auth: only a seated player (holding this match's seat token) may move funds. The oracle
    // session itself is single-use and bound to the verified winner output, so the actual
    // payout destination cannot be redirected here regardless of which seat submits.
    let token = req.get("token").and_then(|v| v.as_str()).unwrap_or("");
    if let Err(e) = authorize_money_caller(&db, &covenant_id, token) {
        return Json(json!({ "success": false, "error": e }));
    }
    let session_id = req
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let signature_hex = req
        .get("signature_hex")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if session_id.is_empty() || signature_hex.is_empty() {
        return Json(
            json!({ "success": false, "error": "submit-settle requires session_id and signature_hex from settle-pot" }),
        );
    }
    let sreq: crate::covenant_builder::SubmitOraclePayoutRequest = match serde_json::from_value(
        json!({
            "session_id": session_id, "signature_hex": signature_hex
        }),
    ) {
        Ok(r) => r,
        Err(e) => {
            return Json(
                json!({ "success": false, "error": format!("build oracle-payout submit request: {e}") }),
            )
        }
    };
    let v =
        crate::covenant_builder::submit_oracle_payout_handler(Extension(db.clone()), Json(sreq))
            .await
            .0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        if let Some(tx) = v.get("payout_tx_id").and_then(|t| t.as_str()) {
            let conn = db.lock().unwrap();
            let _ = conn.execute(
                "UPDATE skill_games SET pot_payout_tx = ?1, updated_at = unixepoch() WHERE covenant_id = ?2",
                params![tx, covenant_id],
            );
        }
    }
    Json(v)
}

/// Load the linked pot for a hashlock-settled match: (pot_tx, match_id, network). Returns
/// Err(message) if there is no pot, the pot is not a hashlock pot, or the domain is missing.
/// The network is read from the p2sh_covenants row (where the pot is recorded on funding).
fn load_hashlock_pot(
    db: &crate::db::Db,
    covenant_id: &str,
) -> Result<(String, String, String), String> {
    let conn = db.lock().unwrap();
    let (pot_tx, settle_mode, match_id): (Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT pot_tx, settle_mode, match_id FROM skill_games WHERE covenant_id = ?1",
            params![covenant_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| "no match for this covenant".to_string())?;
    let pot_tx = match pot_tx {
        Some(t) if !t.is_empty() => t,
        _ => {
            return Err(
                "no pot locked for this game (call lock-pot with settle_mode=hashlock first)"
                    .to_string(),
            )
        }
    };
    if settle_mode.as_deref() != Some("hashlock") {
        return Err(
            "this pot is not a hashlock pot; use /settle-pot (the legacy oracle co-sign) instead"
                .to_string(),
        );
    }
    // The referee hashlock domain bound at lock time. We default to the match covenant_id (the
    // domain lock-pot used) if an older row somehow lacks it, so re-derivation stays consistent.
    let domain = match_id.filter(|s| !s.is_empty()).unwrap_or_else(|| covenant_id.to_string());
    let net: String = conn
        .query_row(
            "SELECT network FROM p2sh_covenants WHERE tx_id = ?1",
            params![pot_tx],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "testnet-12".to_string());
    Ok((pot_tx, domain, net))
}

/// POST /games/:id/settle-pot-hashlock {token, receipt_b64?} : settle a HASHLOCK pot with ZERO
/// server signatures (DEORACLE_PLAN stage 3 + stage 4 ZK gate). The referee REVEALS the winning
/// outcome's secret and the WINNER spends the binary_oracle_select covenant with THEIR OWN key.
///
/// Auth: a seated player (seat token), same as settle-pot. MONEY GATE (two gates, both must pass):
///   1. SERVER GATE: the winning side is re-derived from the server-authoritative engine replay
///      (game_pot_outcome, FAIL CLOSED), so a poisoned `winner` field can never redirect the pot.
///   2. ZK GATE (referee_zk::run_gate_for_network): when a RISC0 game receipt is supplied as
///      `receipt_b64` (or `receipt_hex`), it is CRYPTOGRAPHICALLY verified by the covex-games-prover
///      binary (real STARK proof against the prover-pinned guest image id) and its committed journal
///      is bound to THIS match (winner + moves_digest must match the server record). A verified
///      receipt is MANDATORY on MAINNET (forced, regardless of env) and whenever
///      COVEX_GAMES_ZK_REQUIRE=true; on a testnet without that flag it is optional defense-in-depth
///      (a supplied receipt is still verified; absence falls back to the server gate alone, disclosed
///      honestly in the response). A supplied proof that cannot be verified (no binary, bad proof, or
///      wrong-game journal) is REFUSED, never accepted unverified. On mainnet a missing receipt, an
///      unconfigured prover binary, or an unverifiable receipt all FAIL CLOSED (no secret revealed).
///
/// The referee then re-derives the winning outcome's secret (deterministic from REFEREE_KEY + the
/// match domain) and this handler returns it PLUS the UNSIGNED reveal-branch spend the winner must
/// sign. The server/referee contributes NO signature on the spend: the winner signs `sighash`
/// (BIP340) in their browser and POSTs {session_id, signature_hex, preimage_hex: <revealed_secret>}
/// to /covenant/p2sh/submit-signed.
async fn settle_pot_hashlock(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    // Auth: only a seated player (holding this match's seat token) may settle. (The body is a
    // raw Value so an optional receipt_b64/receipt_hex rides alongside the existing {token};
    // deny_unknown_fields is used nowhere, so an older {token}-only client is unaffected.)
    let token = req.get("token").and_then(|v| v.as_str()).unwrap_or("");
    if let Err(e) = authorize_money_caller(&db, &covenant_id, token) {
        return Json(json!({ "success": false, "error": e }));
    }
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    let p2 = game["player2"].as_str().unwrap_or("").to_string();

    let (pot_tx, domain, net) = match load_hashlock_pot(&db, &covenant_id) {
        Ok(v) => v,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };

    // MONEY GATE 1 (identical posture to settle-pot): re-derive the winning side from the
    // server-authoritative engine replay. game_pot_outcome FAILS CLOSED on anything that is not
    // an engine-decisive board or a server-timed timeout, so a poisoned `winner` field can never
    // pick the destination. 0 = player1 (winner_a / outcome A), 1 = player2 (winner_b / outcome B).
    let outcome: u32 = match crate::covenant_builder::game_pot_outcome(&db, &pot_tx) {
        crate::covenant_builder::GamePot::Verified(o) => o,
        crate::covenant_builder::GamePot::Rejected(msg) => {
            return Json(json!({ "success": false, "error": format!("pot settle refused: {msg}") }))
        }
        crate::covenant_builder::GamePot::NotAGamePot => {
            return Json(json!({ "success": false, "error": "this pot is not linked to a server-verified match; refusing to settle" }))
        }
    };

    // MONEY GATE 2 (ZK winner-proof gate): if a RISC0 game receipt is supplied it is verified by
    // the covex-games-prover binary and bound to this match (committed winner == server outcome AND
    // committed moves_digest == sha256(this match's move log)). Both gates must agree. A required
    // proof that is missing/unverifiable is REFUSED. The two gates are defense-in-depth: the ZK
    // proof attests the move log is a legal terminal game the claimant won; the server gate attests
    // the move log is the genuine record. (See referee_zk for the honest enforcement statement.)
    //
    // MAINNET: `run_gate_for_network` FORCES a verified receipt mandatory when `net` is mainnet,
    // regardless of COVEX_GAMES_ZK_REQUIRE. Real money never settles on the server replay alone:
    // no receipt, no prover binary, or an unverifiable receipt all FAIL CLOSED here (the referee
    // secret below is never reached, so nothing is revealed). Testnet keeps the server-gated
    // fallback (env flag decides).
    let receipt = match crate::referee_zk::decode_receipt_param(&req) {
        Ok(r) => r,
        Err(e) => return Json(json!({ "success": false, "error": format!("invalid receipt param: {e}") })),
    };
    let moves: Vec<String> = serde_json::from_str(game["moves"].as_str().unwrap_or("[]"))
        .unwrap_or_default();
    let zk_note: String = match crate::referee_zk::run_gate_for_network(receipt.as_deref(), &net, outcome, &moves) {
        crate::referee_zk::ZkGate::Verified(note) => note,
        crate::referee_zk::ZkGate::SkippedAllowed(note) => note,
        crate::referee_zk::ZkGate::Refused(msg) => {
            return Json(json!({ "success": false, "error": format!("ZK winner-proof gate refused: {msg}") }))
        }
    };

    let (winner, select_mode) = if outcome == 0 {
        (&p1, "reveal_a")
    } else {
        (&p2, "reveal_b")
    };
    if winner.is_empty() {
        return Json(json!({ "success": false, "error": "winner address missing for the verified outcome" }));
    }

    // THE REFEREE REVEAL: re-derive the winning outcome's secret. This is deterministic from
    // REFEREE_KEY + the match domain (bound at lock time), so it matches the on-chain hashlock
    // committed in branch A/B. The referee is a secret-revealer, NOT a covenant signer: its key
    // appears NOWHERE in the redeem and it signs NOTHING on the spend.
    let preimage_hex = crate::referee::outcome_secret_hex(&net, &domain, outcome);

    // Build the UNSIGNED winner-branch spend (reveal_a / reveal_b) via the EXISTING non-custodial
    // prepare-spend path: the winner's OWN x-only key is the branch signer, the destination is the
    // re-derived winner, and the server holds no key. The winner signs the returned sighash in the
    // browser and submits with the revealed preimage. (We surface the preimage here so the winner
    // can complete the spend; it is revealed on-chain by the spend anyway.)
    let preq: crate::covenant_builder::WalletPrepareRequest = match serde_json::from_value(json!({
        "network": net,
        "deploy_tx_id": pot_tx,
        "destination_addr": winner,
        "branch": select_mode
    })) {
        Ok(r) => r,
        Err(e) => {
            return Json(json!({ "success": false, "error": format!("build prepare-spend request: {e}") }))
        }
    };
    let mut v = crate::covenant_builder::prepare_spend_handler(Extension(db.clone()), Json(preq))
        .await
        .0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        // The winner needs the revealed secret to complete the spend. The server signs nothing.
        v["preimage_hex"] = json!(preimage_hex);
        v["winner_addr"] = json!(winner);
        v["outcome"] = json!(outcome);
        // Honest disclosure of what the ZK gate did for THIS settle (verified proof, or
        // server-gated fallback). The caller can surface this so the winner knows whether a
        // cryptographic proof backed the reveal or only the server replay did.
        v["zk_gate"] = json!(zk_note);
        v["zk_verified"] = json!(receipt.is_some());
        v["next"] = json!(format!(
            "Referee revealed the winner's secret (preimage_hex). Sign `sighash` (BIP340 Schnorr) with the WINNER's wallet ({winner}), then POST {{session_id, signature_hex, preimage_hex}} to /covenant/p2sh/submit-signed to broadcast. The server contributed no signature; only the winner's own key spends."
        ));
    }
    Json(v)
}

/// POST /games/:id/refund-pot-hashlock {token} : reclaim a HASHLOCK pot to the funder
/// (player1) via the CSV refund branch, once the pot UTXO has aged the lock window (so a silent
/// referee cannot strand the stake). ZERO server signatures: the funder spends the refund branch
/// with their OWN key. Auth: restricted to the FUNDER (player1), mirroring refund-channel.
async fn refund_pot_hashlock(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(auth): Json<AuthReq>,
) -> Json<serde_json::Value> {
    // Auth: any seated player passes the base check, but only the FUNDER (player1) may take the
    // refund branch (the redeem's CSV refund key is player1). Reject a player2 caller here.
    match authorize_money_caller(&db, &covenant_id, auth.token.as_deref().unwrap_or("")) {
        Ok(Seat::Player1) => {}
        Ok(Seat::Player2) => {
            return Json(json!({ "success": false, "error": "only the funder (player1) may reclaim the pot via the refund branch" }))
        }
        Err(e) => return Json(json!({ "success": false, "error": e })),
    }
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    if p1.is_empty() {
        return Json(json!({ "success": false, "error": "funder (player1) address missing" }));
    }
    let (pot_tx, _domain, net) = match load_hashlock_pot(&db, &covenant_id) {
        Ok(v) => v,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };
    // Build the UNSIGNED refund-branch spend via the non-custodial prepare-spend path. The CSV
    // (BIP68) age requirement is enforced by the node at broadcast: if the UTXO has not aged the
    // lock window, the submit will be rejected with a sequence-lock error (that is the timelock
    // protecting the winner, not a Covex check). The funder signs with their OWN key.
    let preq: crate::covenant_builder::WalletPrepareRequest = match serde_json::from_value(json!({
        "network": net,
        "deploy_tx_id": pot_tx,
        "destination_addr": p1,
        "branch": "refund"
    })) {
        Ok(r) => r,
        Err(e) => {
            return Json(json!({ "success": false, "error": format!("build prepare-spend request: {e}") }))
        }
    };
    let mut v = crate::covenant_builder::prepare_spend_handler(Extension(db.clone()), Json(preq))
        .await
        .0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        v["next"] = json!(format!(
            "Sign `sighash` (BIP340 Schnorr) with the funder's wallet ({p1}), then POST {{session_id, signature_hex}} to /covenant/p2sh/submit-signed. The node enforces the CSV age window; the refund only confirms once the pot UTXO has aged."
        ));
    }
    Json(v)
}

/// Load the linked pot for a zk_game_settle match: (pot_tx, network). Errors if there is no pot or
/// the pot is not a zk_game_settle pot. The network is read from the p2sh_covenants row.
fn load_zk_pot(db: &crate::db::Db, covenant_id: &str) -> Result<(String, String), String> {
    let conn = db.lock().unwrap();
    let (pot_tx, settle_mode): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT pot_tx, settle_mode FROM skill_games WHERE covenant_id = ?1",
            params![covenant_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "no match for this covenant".to_string())?;
    let pot_tx = match pot_tx {
        Some(t) if !t.is_empty() => t,
        _ => return Err("no pot locked for this game".to_string()),
    };
    if settle_mode.as_deref() != Some("zk_game_settle") {
        return Err(
            "this pot is not an on-chain ZK pot (settle_mode != zk_game_settle); use the hashlock settle path instead"
                .to_string(),
        );
    }
    let net: String = conn
        .query_row(
            "SELECT network FROM p2sh_covenants WHERE tx_id = ?1",
            params![pot_tx],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "testnet-12".to_string());
    Ok((pot_tx, net))
}

/// POST /games/:id/settle-zk {token} : PREPARE the on-chain ZK winner payout for a finished
/// zk_game_settle pot (KIP-16 OpZkPrecompile). The winner proves the game and the CHAIN verifies the
/// Groth16 proof: NO referee reveal and NO Covex co-signature. The server signs nothing.
///
/// GATES (all fail-closed):
///   0. ENV/NET: KASPA_ZK_PRECOMPILE_ENABLED must be on and the network must not be mainnet
///      (zk_precompile_deploy_allowed). Toccata is not live on Kaspa mainnet yet.
///   1. AUTH: a seated player's seat token (authorize_money_caller). The caller must additionally be
///      the WINNER (the verified-outcome side), since only the winner key can spend the winner branch.
///   2. MONEY GATE: the winning side is re-derived from the server-authoritative engine replay
///      (game_pot_outcome, FAIL CLOSED), so a poisoned `winner` field cannot redirect the pot.
///
/// Then it reconstructs the match's `GameInput` (game_type + move log + the two player x-only keys +
/// covenant_id = the pot deploy tx id + stake), asks the PROVER SERVICE (COVEX_PROVER_URL) for a
/// RISC0->Groth16 receipt mapped to its on-chain settle material, builds the UNSIGNED winner-branch
/// spend via the existing non-custodial prepare-spend path, and returns exactly the shape the
/// frontend gamePot.settlePotZkOnchain consumes:
///   { success, proof_hex, public_inputs[5], winner_pubkey, covenant_id, vk_hex, sighash, session_id,
///     signer_xonly, winner_addr, outcome }
/// The winner signs `sighash` (BIP340) in their wallet and POSTs {session_id, signature_hex,
/// proof_hex} to /covenant/p2sh/submit-signed, which assembles the witness + broadcasts. The node
/// runs OpZkPrecompile (0xa6) to verify the proof on-chain before the winner's OpCheckSig pays out.
/// A loser cannot reach a payout: an illegal/unfinished game yields no provable receipt, the journal
/// binds the winner + covenant_id, and consensus rejects a forged or wrong-pot proof.
async fn settle_zk(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    // GATE 1 (auth): only a seated player may settle.
    let token = req.get("token").and_then(|v| v.as_str()).unwrap_or("");
    let seat = match authorize_money_caller(&db, &covenant_id, token) {
        Ok(s) => s,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    let p2 = game["player2"].as_str().unwrap_or("").to_string();

    let (pot_tx, net) = match load_zk_pot(&db, &covenant_id) {
        Ok(v) => v,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };

    // GATE 0 (env/net): the on-chain ZK kind is OFF by default and rejected on mainnet. This is the
    // SAME gate the deploy path uses, so the route cannot run for value before the opcode is frozen.
    if let Err(e) = crate::covenant_builder::zk_precompile_deploy_allowed(&net) {
        return Json(json!({ "success": false, "error": e }));
    }

    // GATE 2 (money gate): re-derive the winning side from the server-authoritative engine replay.
    // game_pot_outcome FAILS CLOSED on anything that is not an engine-decisive board or a server-timed
    // timeout. 0 = player1, 1 = player2.
    let outcome: u32 = match crate::covenant_builder::game_pot_outcome(&db, &pot_tx) {
        crate::covenant_builder::GamePot::Verified(o) => o,
        crate::covenant_builder::GamePot::Rejected(msg) => {
            return Json(json!({ "success": false, "error": format!("pot settle refused: {msg}") }))
        }
        crate::covenant_builder::GamePot::NotAGamePot => {
            return Json(json!({ "success": false, "error": "this pot is not linked to a server-verified match; refusing to settle" }))
        }
    };
    let (winner_addr, winner_seat) = if outcome == 0 {
        (p1.clone(), Seat::Player1)
    } else {
        (p2.clone(), Seat::Player2)
    };
    if winner_addr.is_empty() {
        return Json(json!({ "success": false, "error": "winner address missing for the verified outcome" }));
    }
    // Only the WINNER may claim the winner branch (their key is the only one that can sign it).
    if std::mem::discriminant(&seat) != std::mem::discriminant(&winner_seat) {
        return Json(json!({ "success": false, "error": "only the verified winner may claim the on-chain ZK payout (the loser cannot spend the winner branch)" }));
    }

    // Reconstruct the match's GameInput for the prover. The players are the two x-only keys (so the
    // proof's players[winner] == the covenant's baked winner key), covenant_id = the pot deploy tx id
    // (so the proof binds THIS pot), game_type + moves come from the authoritative match record.
    let p1x = match xonly_hex_from_address(&p1) {
        Ok(x) => x,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };
    let p2x = match xonly_hex_from_address(&p2) {
        Ok(x) => x,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };
    let game_type = game["game_type"].as_str().unwrap_or("").to_string();
    let moves: Vec<String> =
        serde_json::from_str(game["moves"].as_str().unwrap_or("[]")).unwrap_or_default();
    // Stake in sompi from the recorded pot amount (informational in the journal). 1 KAS = 1e8 sompi.
    let stake_sompi: u64 = game["pot_amount_kas"]
        .as_f64()
        .map(|kas| (kas * 100_000_000.0).round() as u64)
        .unwrap_or(0);
    let prover_input = crate::zk_prover_client::ProverGameInput {
        game_type,
        moves,
        players: [p1x, p2x],
        covenant_id: pot_tx.clone(),
        stake_sompi,
        elapsed_ms: None,
    };

    // Ask the PROVER SERVICE for the on-chain settle material. The backend host cannot prove
    // RISC0->Groth16; a missing/unreachable/erroring prover fails closed with an honest message (no
    // fabricated proof is ever returned). The chain re-verifies the proof at spend time regardless.
    let spend = match crate::zk_prover_client::request_settle_spend(&prover_input).await {
        Ok(s) => s,
        Err(e) => return Json(json!({ "success": false, "error": format!("could not obtain the on-chain ZK proof: {e}") })),
    };
    // Sanity: the prover's winner_code must agree with the server money gate. If they disagree the
    // proof would not pay the server-verified winner, so refuse rather than hand over a mismatch.
    if spend.winner_code as u32 != outcome {
        return Json(json!({ "success": false, "error": format!("prover winner_code {} disagrees with the server-verified outcome {outcome}; refusing to settle", spend.winner_code) }));
    }

    // Build the UNSIGNED winner-branch spend via the EXISTING non-custodial prepare-spend path. The
    // winner's OWN x-only key is the branch signer, the destination is the re-derived winner, and the
    // server holds no key. The winner signs the returned sighash and submits with proof_hex.
    let preq: crate::covenant_builder::WalletPrepareRequest = match serde_json::from_value(json!({
        "network": net,
        "deploy_tx_id": pot_tx,
        "destination_addr": winner_addr,
        "branch": "winner"
    })) {
        Ok(r) => r,
        Err(e) => {
            return Json(json!({ "success": false, "error": format!("build prepare-spend request: {e}") }))
        }
    };
    let mut v = crate::covenant_builder::prepare_spend_handler(Extension(db.clone()), Json(preq))
        .await
        .0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        // Carry the on-chain witness material the winner submits with (the chain re-verifies it).
        v["proof_hex"] = json!(spend.proof_hex);
        v["public_inputs"] = json!(spend.public_inputs);
        v["winner_pubkey"] = json!(spend.winner_pubkey);
        v["covenant_id"] = json!(spend.covenant_id);
        v["vk_hex"] = json!(spend.vk_hex);
        v["winner_addr"] = json!(winner_addr);
        v["outcome"] = json!(outcome);
        v["onchain_zk"] = json!(true);
        v["next"] = json!(format!(
            "Sign `sighash` (BIP340 Schnorr) with the WINNER's wallet ({winner_addr}), then POST {{session_id, signature_hex, proof_hex}} to /covenant/p2sh/submit-signed to broadcast. The node verifies the Groth16 proof on-chain via OpZkPrecompile before the winner's OpCheckSig releases the pot; the server contributed no signature."
        ));
    }
    Json(v)
}

/// POST /games/:id/lock-channel {stake_kas, refund_after_daa, network?} : the TRUSTLESS,
/// NON-CUSTODIAL games pot. Locks the stake into the on-chain channel script (OP_IF 2-of-2
/// [player1, player2] cooperative close, OP_ELSE a CLTV refund to the funder = player1).
/// There is NO Covex oracle key in the redeem, so Covex can never move the funds.
///
/// De-custodialized: this returns the UNSIGNED funding tx + the sighash for player1's
/// WALLET to sign in the browser (via /covenant/p2sh/prepare-deploy). The browser then
/// posts the signature to /covenant/p2sh/submit-deploy. No private key ever touches the
/// server - the old use_dev_mode operator-custody path is gone. The funder is player1 so
/// that the CLTV refund branch (which only the funder can take) matches who paid in.
async fn lock_channel(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    // Auth: only a seated player (holding this match's seat token) may lock funds.
    let token = req.get("token").and_then(|v| v.as_str()).unwrap_or("");
    if let Err(e) = authorize_money_caller(&db, &covenant_id, token) {
        return Json(json!({ "success": false, "error": e }));
    }
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    let p2 = game["player2"].as_str().unwrap_or("").to_string();
    if p1.is_empty() || p2.is_empty() {
        return Json(
            json!({ "success": false, "error": "game needs two players before locking a channel" }),
        );
    }
    let stake = req.get("stake_kas").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if !(stake > 0.0) {
        return Json(json!({ "success": false, "error": "stake_kas must be > 0" }));
    }
    let net = req
        .get("network")
        .and_then(|v| v.as_str())
        .unwrap_or("testnet-12")
        .to_string();
    // refund_after_daa: the absolute DAA after which the funder may reclaim if there is no
    // cooperative close (so a vanished counterparty cannot freeze the pot). The caller
    // (frontend) passes the current node DAA plus a window from /api/status. Keep the
    // window SHORT for low-trust games; note that the funder (player1) could stall a
    // losing position by refusing the cooperative close and refunding after this DAA.
    let refund_after_daa = match req.get("refund_after_daa").and_then(|v| v.as_u64()) {
        Some(d) => d,
        None => {
            return Json(
                json!({ "success": false, "error": "lock-channel requires refund_after_daa (current node DAA + a SHORT refund window)" }),
            )
        }
    };
    let p1x = match xonly_hex_from_address(&p1) {
        Ok(x) => x,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };
    let p2x = match xonly_hex_from_address(&p2) {
        Ok(x) => x,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };

    // Trustless channel: cooperative 2-of-2 [player1, player2] close OR a funder refund
    // after refund_after_daa. NO oracle pubkey - Covex is never in the payout path. We
    // build the funding tx but DO NOT sign it: player1's wallet signs the returned sighash.
    let dreq: crate::covenant_builder::PrepareDeployRequest = match serde_json::from_value(json!({
        "network": net, "deployer_addr": p1, "stake_kas": stake,
        "redeem": { "kind": "channel", "pubkeys_hex": [p1x, p2x], "lock_daa": refund_after_daa }
    })) {
        Ok(r) => r,
        Err(e) => {
            return Json(json!({ "success": false, "error": format!("build channel deploy: {e}") }))
        }
    };
    let v = crate::covenant_builder::prepare_deploy_handler(Extension(db.clone()), Json(dreq))
        .await
        .0;
    // The browser signs `sighash` and calls /covenant/p2sh/submit-deploy. We record the
    // resulting deploy_tx_id by having the frontend re-call /games/:id/bind-channel-pot,
    // OR (simpler) the frontend passes the deploy_tx_id to settle/refund directly. Here we
    // surface a hint so the caller knows the next step; we do NOT mark pot_tx yet (no tx
    // exists until the wallet broadcasts it).
    let mut out = v;
    if out
        .get("success")
        .and_then(|s| s.as_bool())
        .unwrap_or(false)
    {
        out["next"] = json!("sign `sighash` with player1's wallet, POST {session_id, signature_hex} to /covenant/p2sh/submit-deploy, then POST the returned deploy_tx_id to /games/:id/bind-channel-pot to link the pot to this match");
        out["funder"] = json!(p1);
    }
    Json(out)
}

/// POST /games/:id/bind-channel-pot {deploy_tx_id, token} : after the funder's wallet has
/// broadcast the channel funding tx (via /covenant/p2sh/submit-deploy), link that on-chain
/// pot to this match so settle/refund can find it. Seat-token gated (fail-closed). We
/// require the deploy_tx_id to be an indexed channel covenant whose funder address matches
/// player1, so a caller cannot bind an unrelated or non-channel covenant as the pot.
async fn bind_channel_pot(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let token = req.get("token").and_then(|v| v.as_str()).unwrap_or("");
    if let Err(e) = authorize_money_caller(&db, &covenant_id, token) {
        return Json(json!({ "success": false, "error": e }));
    }
    let deploy_tx = match req
        .get("deploy_tx_id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        Some(t) => t.to_string(),
        None => {
            return Json(
                json!({ "success": false, "error": "bind-channel-pot requires deploy_tx_id (from submit-deploy)" }),
            )
        }
    };
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    // Verify the bound tx is a channel covenant funded by player1, so the pot the chain
    // enforces is the 2-of-2 [p1, p2] / p1-refund script for THIS match.
    let (kind, creator): (String, String) = {
        let conn = db.lock().unwrap();
        match conn.query_row(
            "SELECT redeem_kind, creator_addr FROM p2sh_covenants WHERE tx_id = ?1",
            params![deploy_tx],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        ) {
            Ok(v) => v,
            Err(_) => {
                return Json(
                    json!({ "success": false, "error": "deploy_tx_id is not an indexed covenant (broadcast and index it via submit-deploy first)" }),
                )
            }
        }
    };
    if !kind.starts_with("channel") {
        return Json(
            json!({ "success": false, "error": format!("deploy_tx_id is a '{kind}' covenant, not a channel pot") }),
        );
    }
    if creator != p1 {
        return Json(
            json!({ "success": false, "error": "the channel pot was not funded by this match's player1 (funder mismatch)" }),
        );
    }
    let pot_kas = game["pot_amount_kas"].as_f64().unwrap_or(0.0);
    {
        let conn = db.lock().unwrap();
        let _ = conn.execute(
            "UPDATE skill_games SET pot_tx = ?1, updated_at = unixepoch() WHERE covenant_id = ?2",
            params![deploy_tx, covenant_id],
        );
        let _ = conn.execute(
            "UPDATE skill_games SET pot_amount_kas = (SELECT amount_kaspa FROM covenants WHERE tx_id = ?1 || ':0') WHERE covenant_id = ?2 AND pot_amount_kas = 0",
            params![deploy_tx, covenant_id],
        );
        let _ = pot_kas;
    }
    Json(
        json!({ "success": true, "pot_tx": deploy_tx, "message": "channel pot linked to this match" }),
    )
}

/// POST /games/:id/settle-channel : the cooperative close. Reads the SERVER-VERIFIED winner
/// and builds the UNSIGNED 2-of-2 close paying that winner, returning the sighash BOTH
/// players must sign in their own wallets. No Covex oracle key is ever used and the server
/// holds NO key: the chain pays the winner purely on the two players' co-signature.
///
/// De-custodialized: the old use_dev_mode operator-custody path is gone. settle-channel no
/// longer broadcasts; it returns {session_id, sighash, required_signers:[player1, player2]}.
/// The browser collects BOTH BIP340 signatures over that exact sighash and POSTs them to
/// /covenant/p2sh/submit-signed (channel close branch), which assembles `<sig_p2> <sig_p1>
/// OP_TRUE` and broadcasts. A single-sig or wrong-signer close fails the on-chain script.
///
/// HONESTY: a non-cooperating loser is NOT punished on-chain (Kaspa 0.15.0 has no
/// introspection opcodes, so no Lightning-style penalty tx is expressible). If a player
/// refuses to co-sign, the ONLY recourse is the CLTV refund branch (funder = player1) after
/// the channel's lock_daa. Keep the timeout window short for low-trust games.
async fn settle_channel(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(auth): Json<AuthReq>,
) -> Json<serde_json::Value> {
    // Auth: only a seated player (holding this match's seat token) may settle.
    if let Err(e) = authorize_money_caller(&db, &covenant_id, auth.token.as_deref().unwrap_or("")) {
        return Json(json!({ "success": false, "error": e }));
    }
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let winner = game["winner"].as_str().unwrap_or("").to_string();
    if winner.is_empty() {
        return Json(json!({ "success": false, "error": "game has no winner yet" }));
    }
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    let p2 = game["player2"].as_str().unwrap_or("").to_string();
    let (pot_tx, net): (Option<String>, String) = {
        let conn = db.lock().unwrap();
        let pot: Option<String> = conn
            .query_row(
                "SELECT pot_tx FROM skill_games WHERE covenant_id = ?1",
                params![covenant_id],
                |r| r.get(0),
            )
            .ok()
            .flatten();
        let net = pot
            .as_ref()
            .and_then(|t| {
                conn.query_row(
                    "SELECT network FROM p2sh_covenants WHERE tx_id = ?1",
                    params![t],
                    |r| r.get::<_, String>(0),
                )
                .ok()
            })
            .unwrap_or_else(|| "testnet-12".to_string());
        (pot, net)
    };
    let pot_tx = match pot_tx {
        Some(t) if !t.is_empty() => t,
        _ => {
            return Json(
                json!({ "success": false, "error": "no channel pot locked (call lock-channel first)" }),
            )
        }
    };
    let wl = winner.to_lowercase();
    let dest_outcome: u32 = if winner == p1 || wl == "white" || wl == "player1" {
        0
    } else if winner == p2 || wl == "black" || wl == "player2" {
        1
    } else {
        return Json(
            json!({ "success": false, "error": format!("cannot map winner '{winner}' to a player") }),
        );
    };
    // MONEY GATE (defense in depth): re-derive the winner from the server-authoritative
    // engine replay of the move log - exactly like settle-pot - and refuse to build the
    // close unless it matches the recorded winner's side. Move/resign are now token-bound
    // (only the seated client can act), but this gate ALSO rejects a forged/concession
    // (end_reason='resign'/'client') outcome: game_pot_outcome FAILS CLOSED on anything
    // that is not an engine-decisive board or a server-timed timeout. So even a poisoned
    // `winner` field can never drain the 2-of-2 channel pot.
    match crate::covenant_builder::game_pot_outcome(&db, &pot_tx) {
        crate::covenant_builder::GamePot::Verified(o) if o == dest_outcome => {}
        crate::covenant_builder::GamePot::Verified(o) => {
            return Json(
                json!({ "success": false, "error": format!("recorded winner maps to side {dest_outcome} but the server-verified result is side {o}; refusing to close to the wrong player") }),
            );
        }
        crate::covenant_builder::GamePot::Rejected(msg) => {
            return Json(
                json!({ "success": false, "error": format!("channel close refused: {msg}") }),
            );
        }
        crate::covenant_builder::GamePot::NotAGamePot => {
            return Json(
                json!({ "success": false, "error": "this channel pot is not linked to a server-verified match; refusing to close" }),
            );
        }
    }
    let dest = if dest_outcome == 0 { &p1 } else { &p2 };
    // 2-of-2 cooperative close: build the UNSIGNED spend paying the winner and return the
    // sighash BOTH players sign in their wallets. NO server key, NO oracle key. The browser
    // posts both sigs to /covenant/p2sh/submit-signed; the satisfier `<sig_p2> <sig_p1>
    // OP_TRUE` selects the IF (cooperative-close) branch, so a single or wrong signature
    // fails the script. We do NOT broadcast here.
    let preq: crate::covenant_builder::WalletPrepareRequest = match serde_json::from_value(json!({
        "network": net, "deploy_tx_id": pot_tx, "destination_addr": dest, "branch": "close"
    })) {
        Ok(r) => r,
        Err(e) => {
            return Json(json!({ "success": false, "error": format!("build channel close: {e}") }))
        }
    };
    let v = crate::covenant_builder::prepare_spend_handler(Extension(db.clone()), Json(preq))
        .await
        .0;
    let mut out = v;
    if out
        .get("success")
        .and_then(|s| s.as_bool())
        .unwrap_or(false)
    {
        out["next"] = json!("both player1 and player2 sign `sighash` (BIP340) in their wallets, then POST {session_id, signatures:[{signer_xonly, signature_hex} x2]} to /covenant/p2sh/submit-signed to broadcast the cooperative close");
        out["winner_dest"] = json!(dest);
    }
    Json(out)
}

/// POST /games/:id/refund-channel : the funder (player1) reclaims the channel pot via the
/// timeout branch when there was no cooperative close (e.g. the opponent vanished). The
/// spend sets lock_time to the channel's refund_after_daa, so the node rejects it until the
/// chain reaches that DAA, and the ELSE branch's CheckSig is player1's key, so ONLY the
/// funder can take it. No oracle key - the funder always recovers after the timeout, so the
/// pot can never be permanently frozen.
///
/// De-custodialized: the old use_dev_mode operator-custody path is gone. This returns the
/// UNSIGNED refund tx + the sighash for PLAYER1's wallet to sign (branch=refund, satisfier
/// `<sig_p1> OP_FALSE`). The browser POSTs {session_id, signature_hex} to
/// /covenant/p2sh/submit-signed to broadcast. Restricted to player1 at BOTH layers: the
/// seat-token gate here AND the on-chain refund CheckSig (player1's key).
async fn refund_channel(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(auth): Json<AuthReq>,
) -> Json<serde_json::Value> {
    // Auth: only a seated player may act, AND the refund branch (reclaiming the
    // pot to the funder) is restricted to the funder = player1, who funded the
    // channel. A valid player2 token must NOT be able to trigger a refund.
    match authorize_money_caller(&db, &covenant_id, auth.token.as_deref().unwrap_or("")) {
        Ok(Seat::Player1) => {}
        Ok(Seat::Player2) => {
            return Json(
                json!({ "success": false, "error": "only the funder (player1) may refund the channel pot" }),
            );
        }
        Err(e) => return Json(json!({ "success": false, "error": e })),
    }
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    if p1.is_empty() {
        return Json(json!({ "success": false, "error": "game has no funder" }));
    }
    let (pot_tx, net): (Option<String>, String) = {
        let conn = db.lock().unwrap();
        let pot: Option<String> = conn
            .query_row(
                "SELECT pot_tx FROM skill_games WHERE covenant_id = ?1",
                params![covenant_id],
                |r| r.get(0),
            )
            .ok()
            .flatten();
        let net = pot
            .as_ref()
            .and_then(|t| {
                conn.query_row(
                    "SELECT network FROM p2sh_covenants WHERE tx_id = ?1",
                    params![t],
                    |r| r.get::<_, String>(0),
                )
                .ok()
            })
            .unwrap_or_else(|| "testnet-12".to_string());
        (pot, net)
    };
    let pot_tx = match pot_tx {
        Some(t) if !t.is_empty() => t,
        _ => return Json(json!({ "success": false, "error": "no channel pot locked" })),
    };
    // Build the UNSIGNED refund spend (ELSE/timeout branch) and return the sighash for
    // player1's wallet. branch=refund commits lock_time = the channel's refund DAA, so the
    // node rejects it until the chain reaches it. NO server key, NO oracle key. The browser
    // signs and POSTs to /covenant/p2sh/submit-signed; the satisfier `<sig_p1> OP_FALSE`
    // selects the ELSE branch, which only player1's key can satisfy.
    let preq: crate::covenant_builder::WalletPrepareRequest = match serde_json::from_value(json!({
        "network": net, "deploy_tx_id": pot_tx, "destination_addr": p1, "branch": "refund"
    })) {
        Ok(r) => r,
        Err(e) => {
            return Json(json!({ "success": false, "error": format!("build channel refund: {e}") }))
        }
    };
    let v = crate::covenant_builder::prepare_spend_handler(Extension(db.clone()), Json(preq))
        .await
        .0;
    let mut out = v;
    if out
        .get("success")
        .and_then(|s| s.as_bool())
        .unwrap_or(false)
    {
        out["next"] = json!("player1 signs `sighash` (BIP340) in their wallet, then POST {session_id, signature_hex} to /covenant/p2sh/submit-signed to broadcast the refund (valid only after the channel's refund DAA)");
    }
    Json(out)
}

#[derive(serde::Deserialize)]
struct ResignReq {
    player: String,
    /// Per-seat secret issued at join (see make_move). Required for tokenised
    /// games so the opponent cannot resign the victim's seat.
    #[serde(default)]
    token: Option<String>,
}

/// POST /games/:id/resign : the caller forfeits the match (quit = loss), on OR off
/// their turn. The server records winner = opponent with end_reason='resign'. NOTE:
/// moves are not yet wallet-authenticated, so a resign is only trustworthy between
/// cooperating clients; the pot gate therefore does NOT settle a pot on a resign
/// (only on server-timed timeouts or an engine-decisive board), see game_pot_outcome.
async fn resign_game(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<ResignReq>,
) -> Json<serde_json::Value> {
    let result = {
        let conn = db.lock().unwrap();
        let row: Option<(String, String, String, Option<String>, Option<String>)> = conn
            .query_row(
                "SELECT player1, player2, status, p1_token, p2_token FROM skill_games WHERE covenant_id = ?1",
                params![covenant_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .ok();
        match row {
            None => Err("no match for this covenant".to_string()),
            Some((p1, p2, status, p1_token, p2_token)) => {
                if status == "finished" {
                    Err("match already finished".to_string())
                } else if req.player != p1 && req.player != p2 {
                    Err("only a seated player can resign".to_string())
                } else if let Err(e) = check_seat_token(
                    if req.player == p1 {
                        &p1_token
                    } else {
                        &p2_token
                    },
                    req.token.as_deref().unwrap_or(""),
                ) {
                    // The resigner must hold their own seat token, so the
                    // opponent cannot forfeit the victim's match.
                    Err(e)
                } else {
                    let win = if req.player == p1 { "black" } else { "white" };
                    conn.execute(
                        "UPDATE skill_games SET status = 'finished', winner = ?1, end_reason = 'resign', updated_at = unixepoch() WHERE covenant_id = ?2",
                        params![win, covenant_id],
                    )
                    .map(|_| ())
                    .map_err(|e| e.to_string())
                }
            }
        }
    };
    match result {
        Ok(()) => {
            let game = fetch_game(&db, &covenant_id);
            live::publish(
                "game_move",
                json!({"covenant_id": covenant_id, "game": game}),
            );
            Json(json!({"success": true, "game": game}))
        }
        Err(e) => Json(json!({"success": false, "error": e})),
    }
}

/// POST /games/:id/claim-timeout : if the side to move has run its clock out, the
/// SERVER finalises a timeout loss for them (winner = opponent, end_reason='timeout').
/// The server recomputes elapsed from its own turn_started_at and server-written
/// budgets, so neither player can fake or dodge a timeout - which is why a timeout
/// IS allowed to settle a real pot (unlike a forgeable resign).
async fn claim_timeout(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
    let result = {
        let conn = db.lock().unwrap();
        let row: Option<(String, String, i64, i64, i64, i64)> = conn
            .query_row(
                "SELECT current_turn, status, p1_time_ms, p2_time_ms, turn_started_at, unixepoch() FROM skill_games WHERE covenant_id = ?1",
                params![covenant_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .ok();
        match row {
            None => Err("no match for this covenant".to_string()),
            Some((turn, status, p1_ms, p2_ms, turn_started, now)) => {
                if status != "active" {
                    Err("match is not active".to_string())
                } else {
                    let elapsed_ms = if turn_started > 0 {
                        (now - turn_started).max(0) * 1000
                    } else {
                        0
                    };
                    let budget = if turn == "white" { p1_ms } else { p2_ms };
                    if budget - elapsed_ms <= 0 {
                        let win = if turn == "white" { "black" } else { "white" };
                        let (np1, np2) = if turn == "white" {
                            (0i64, p2_ms)
                        } else {
                            (p1_ms, 0i64)
                        };
                        conn.execute(
                            "UPDATE skill_games SET status = 'finished', winner = ?1, end_reason = 'timeout', p1_time_ms = ?2, p2_time_ms = ?3, updated_at = unixepoch() WHERE covenant_id = ?4",
                            params![win, np1, np2, covenant_id],
                        )
                        .map(|_| true)
                        .map_err(|e| e.to_string())
                    } else {
                        Ok(false)
                    }
                }
            }
        }
    };
    match result {
        Ok(timed_out) => {
            let game = fetch_game(&db, &covenant_id);
            if timed_out {
                live::publish(
                    "game_move",
                    json!({"covenant_id": covenant_id, "game": game}),
                );
            }
            Json(json!({"success": true, "timed_out": timed_out, "game": game}))
        }
        Err(e) => Json(json!({"success": false, "error": e})),
    }
}

/// GET /games?status=waiting|active&limit=50 : matchmaking + arena counts.
async fn list_games(
    Extension(db): Extension<crate::db::Db>,
    Query(p): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let status = p.get("status").cloned().unwrap_or_else(|| "waiting".into());
    let limit: i64 = p
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(50)
        .clamp(1, 200);
    let conn = db.lock().unwrap();
    let mut stmt = match conn.prepare(&format!(
        "{} WHERE status = ?1 ORDER BY updated_at DESC LIMIT ?2",
        GAME_SELECT
    )) {
        Ok(s) => s,
        Err(e) => return Json(json!({"games": [], "error": e.to_string()})),
    };
    let rows = stmt
        .query_map(params![status, limit], row_to_game)
        .map(|r| r.flatten().collect::<Vec<_>>())
        .unwrap_or_default();
    Json(json!({"games": rows, "total": rows.len(), "status": status}))
}

async fn get_game(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
    match fetch_game(&db, &covenant_id) {
        Some(g) => Json(json!({"game": g})),
        None => Json(json!({"game": null})),
    }
}

#[derive(serde::Deserialize)]
struct JoinReq {
    player: String,
    #[serde(default)]
    game_type: Option<String>,
    #[serde(default)]
    pot_amount_kas: Option<f64>,
}

/// POST /games/:id/join : first caller creates the match as player1 and
/// waits; the second distinct address activates it as player2.
async fn join_game(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<JoinReq>,
) -> Json<serde_json::Value> {
    if req.player.trim().is_empty() {
        return Json(json!({"success": false, "error": "player address required"}));
    }
    let result = {
        let conn = db.lock().unwrap();
        let existing: Option<(String, String, String)> = conn
            .query_row(
                "SELECT player1, player2, status FROM skill_games WHERE covenant_id = ?1",
                params![covenant_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .ok();
        // Result carries (status, newly-issued (token, seat)). The token is
        // returned ONLY when we just seated this caller, so it is never handed
        // to someone who merely knows a public player address.
        match existing {
            None => {
                let gt = req.game_type.clone().unwrap_or_else(|| "chess".into());
                let token = gen_seat_token();
                conn.execute(
                    "INSERT INTO skill_games (covenant_id, game_type, pot_amount_kas, player1, status, p1_token) VALUES (?1, ?2, ?3, ?4, 'waiting', ?5)",
                    params![covenant_id, gt, req.pot_amount_kas.unwrap_or(0.0), req.player, token],
                )
                .map(|_| ("waiting", Some((token, "white"))))
                .map_err(|e| e.to_string())
            }
            Some((p1, p2, status)) => {
                if p1 == req.player || p2 == req.player {
                    // Rejoin/poll: the seated client already holds its token
                    // (stored locally on first join). Do NOT re-issue it here -
                    // that would leak it to anyone who knows the address.
                    Ok((
                        if status == "waiting" {
                            "waiting"
                        } else {
                            "active"
                        },
                        None,
                    ))
                } else if status == "waiting" && p2.is_empty() {
                    // Match goes live: seat player2 (black) + start white's clock.
                    let token = gen_seat_token();
                    conn.execute(
                        "UPDATE skill_games SET player2 = ?1, status = 'active', p2_token = ?2, turn_started_at = unixepoch(), updated_at = unixepoch() WHERE covenant_id = ?3",
                        params![req.player, token, covenant_id],
                    )
                    .map(|_| ("active", Some((token, "black"))))
                    .map_err(|e| e.to_string())
                } else {
                    Err("match is full".to_string())
                }
            }
        }
    };
    match result {
        Ok((status, issued)) => {
            let game = fetch_game(&db, &covenant_id);
            live::publish(
                "game_update",
                json!({"covenant_id": covenant_id, "status": status, "game": game}),
            );
            let mut body = json!({"success": true, "status": status, "game": game});
            if let Some((token, seat)) = issued {
                body["your_token"] = json!(token);
                body["your_seat"] = json!(seat);
            }
            Json(body)
        }
        Err(e) => Json(json!({"success": false, "error": e})),
    }
}

#[derive(serde::Deserialize)]
struct MoveReq {
    player: String,
    /// Move notation (SAN/UCI for chess, column index for connect4, etc.)
    r#move: String,
    #[serde(default)]
    winner: Option<String>,
    #[serde(default)]
    finished: Option<bool>,
    /// Keep the turn after this move: multi-action sequences by one player
    /// (e.g. blackjack hits before a stand). Turn ownership is still
    /// enforced; this only skips the flip afterwards.
    #[serde(default)]
    keep_turn: Option<bool>,
    /// Per-seat secret issued at join. Proves the caller holds this side's
    /// seat (not just knows the public address). Required for tokenised games.
    #[serde(default)]
    token: Option<String>,
}

/// POST /games/:id/move : append a move, flip the turn, optionally finish.
/// Turn enforcement: player1 moves on 'white', player2 on 'black'.
async fn make_move(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<MoveReq>,
) -> Json<serde_json::Value> {
    let result = {
        let conn = db.lock().unwrap();
        let row: Option<(String, String, String, String, String, String, i64, i64, i64, i64, Option<String>, Option<String>)> = conn
            .query_row(
                "SELECT player1, player2, moves, current_turn, status, game_type, p1_time_ms, p2_time_ms, turn_started_at, unixepoch(), p1_token, p2_token FROM skill_games WHERE covenant_id = ?1",
                params![covenant_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?, r.get(10)?, r.get(11)?)),
            )
            .ok();
        match row {
            None => Err("no match for this covenant; join first".to_string()),
            Some((
                p1,
                p2,
                moves_raw,
                turn,
                status,
                game_type,
                p1_ms,
                p2_ms,
                turn_started,
                now,
                p1_token,
                p2_token,
            )) => {
                if status == "finished" {
                    Err("match already finished".to_string())
                } else if (turn == "white" && req.player != p1)
                    || (turn == "black" && req.player != p2)
                {
                    Err("not your turn".to_string())
                } else if let Err(e) = check_seat_token(
                    if turn == "white" {
                        &p1_token
                    } else {
                        &p2_token
                    },
                    req.token.as_deref().unwrap_or(""),
                ) {
                    // Only the seated client (holding the token) may submit this
                    // side's move - closes the opponent-forges-victim's-move hole.
                    Err(e)
                } else {
                    // Server-authoritative clock: charge the mover for the time spent
                    // this turn. turn_started_at and the budgets are written ONLY by the
                    // server, so a client cannot manufacture or dodge a timeout.
                    let elapsed_ms = if turn_started > 0 {
                        (now - turn_started).max(0) * 1000
                    } else {
                        0
                    };
                    let mover_budget = if turn == "white" { p1_ms } else { p2_ms };
                    let mover_remaining = mover_budget - elapsed_ms;
                    if mover_remaining <= 0 {
                        // The mover's clock ran out: they lose on time (end_reason=timeout).
                        let win = if turn == "white" { "black" } else { "white" };
                        let (np1, np2) = if turn == "white" {
                            (0i64, p2_ms)
                        } else {
                            (p1_ms, 0i64)
                        };
                        conn.execute(
                            "UPDATE skill_games SET status = 'finished', winner = ?1, end_reason = 'timeout', p1_time_ms = ?2, p2_time_ms = ?3, updated_at = unixepoch() WHERE covenant_id = ?4",
                            params![win, np1, np2, covenant_id],
                        )
                        .map(|_| ())
                        .map_err(|e| e.to_string())
                    } else if req.r#move.len() > 64 {
                        // 64 covers checkers multi-jump chains ("1-10-19-28-37")
                        // and future phase tokens; chess SAN never gets close
                        Err("move too long".to_string())
                    } else {
                        let mut moves: Vec<String> =
                            serde_json::from_str(&moves_raw).unwrap_or_default();
                        if moves.len() >= 1024 {
                            Err("move limit reached".to_string())
                        } else {
                            moves.push(req.r#move.clone());
                            // Server-authoritative outcome. For replayable games the
                            // server REPLAYS the move log and decides finished/winner
                            // itself, ignoring the client's claim (the real "prove who
                            // won"). Turn ownership was enforced above, so the mover's
                            // colour is `turn`; an undecided board still permits a
                            // concession/draw (winner is not the mover) but rejects a
                            // self-declared win. end_reason records HOW it ended so the
                            // pot gate can trust server-decided timeouts but stay strict
                            // on (forgeable) concessions until move-auth lands.
                            let claimed_finished = req.finished.unwrap_or(false);
                            let outcome: Result<(bool, Option<String>, &'static str), String> =
                                match game_engine::result_from_moves(&game_type, &moves) {
                                    Some(game_engine::GameResult::Unfinished) => {
                                        if claimed_finished {
                                            if req.winner.as_deref() == Some(turn.as_str()) {
                                                Err("cannot declare yourself the winner on an undecided board".to_string())
                                            } else {
                                                Ok((true, req.winner.clone(), "resign"))
                                            }
                                        } else {
                                            Ok((false, None, ""))
                                        }
                                    }
                                    Some(decisive) => Ok((
                                        true,
                                        decisive.winner_str().map(|s| s.to_string()),
                                        "board",
                                    )),
                                    // Unsupported game type: no server replay yet, so
                                    // fall back to the client-reported result (still
                                    // turn-enforced; the pot gate fails closed for these).
                                    None => Ok((
                                        claimed_finished,
                                        req.winner.clone(),
                                        if claimed_finished { "client" } else { "" },
                                    )),
                                };
                            match outcome {
                                Err(e) => Err(e),
                                Ok((finished, winner, reason)) => {
                                    let next = if finished {
                                        turn.as_str()
                                    } else if req.keep_turn.unwrap_or(false) {
                                        turn.as_str()
                                    } else if turn == "white" {
                                        "black"
                                    } else {
                                        "white"
                                    };
                                    let new_status = if finished { "finished" } else { "active" };
                                    // Write back the mover's deducted clock; the next
                                    // player's clock starts now (turn_started_at).
                                    let (np1, np2) = if turn == "white" {
                                        (mover_remaining, p2_ms)
                                    } else {
                                        (p1_ms, mover_remaining)
                                    };
                                    let end_reason: Option<&str> = if finished && !reason.is_empty()
                                    {
                                        Some(reason)
                                    } else {
                                        None
                                    };
                                    conn.execute(
                                        "UPDATE skill_games SET moves = ?1, current_turn = ?2, status = ?3, winner = ?4, p1_time_ms = ?5, p2_time_ms = ?6, turn_started_at = unixepoch(), end_reason = ?7, updated_at = unixepoch() WHERE covenant_id = ?8",
                                        params![
                                            serde_json::to_string(&moves).unwrap_or_else(|_| "[]".into()),
                                            next,
                                            new_status,
                                            winner,
                                            np1,
                                            np2,
                                            end_reason,
                                            covenant_id
                                        ],
                                    )
                                    .map(|_| ())
                                    .map_err(|e| e.to_string())
                                }
                            }
                        }
                    }
                }
            }
        }
    };
    match result {
        Ok(()) => {
            let game = fetch_game(&db, &covenant_id);
            live::publish(
                "game_move",
                json!({"covenant_id": covenant_id, "game": game}),
            );
            Json(json!({"success": true, "game": game}))
        }
        Err(e) => Json(json!({"success": false, "error": e})),
    }
}

#[cfg(test)]
mod tests {
    //! Money-route auth and timeout-gate tests for the non-custodial games pot.
    //!
    //! Scope: these tests exercise the HANDLERS' validation gates (seat-token auth,
    //! two-player precondition, replay protection, server-timed clock) end-to-end
    //! against a real SQLite DB built from `db::open_db`. They DO NOT spin up a
    //! kaspad RPC or covenant deployer; the downstream prepare_deploy /
    //! submit_deploy / oracle-payout calls only fire AFTER the gates pass, so the
    //! gates being tested here run to completion without touching the chain.
    //!
    //! Honesty note: this is auth + precondition coverage, not a money-path e2e.
    //! The actual fund-flow ("a real pot leaves the script only to the verified
    //! winner") is proven on testnet-12 with live oracle co-sign, not in these
    //! unit tests.
    use super::*;
    use crate::db::Db;

    /// Build a fresh, file-backed DB with the production schema. Each test gets
    /// its own path so they can run in parallel without locking each other out
    /// (WAL is configured by `open_db`).
    fn fresh_db() -> Db {
        let p = std::env::temp_dir().join(format!(
            "covex-games-test-{}.sqlite",
            uuid::Uuid::new_v4().simple()
        ));
        // Best-effort cleanup of any stale file at this path before opening.
        let _ = std::fs::remove_file(&p);
        crate::db::open_db(p.to_str().expect("temp path is utf-8")).expect("open_db on temp path")
    }

    /// Insert an active 2-player match with known per-seat tokens. Mirrors the
    /// row shape `join_game` produces once both players have seated.
    fn seed_two_player_active(
        db: &Db,
        covenant_id: &str,
        p1: &str,
        p2: &str,
        p1_token: &str,
        p2_token: &str,
    ) {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO skill_games (covenant_id, game_type, pot_amount_kas, player1, player2, status, p1_token, p2_token, turn_started_at, p1_time_ms, p2_time_ms) \
             VALUES (?1, 'chess', 0, ?2, ?3, 'active', ?4, ?5, unixepoch(), 300000, 300000)",
            params![covenant_id, p1, p2, p1_token, p2_token],
        )
        .expect("seed two-player active row");
    }

    /// Insert a single-player WAITING match (player2 still empty). Mirrors the
    /// row shape `join_game` produces after the first join, before the second.
    fn seed_one_player_waiting(db: &Db, covenant_id: &str, p1: &str, p1_token: &str) {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO skill_games (covenant_id, game_type, pot_amount_kas, player1, player2, status, p1_token) \
             VALUES (?1, 'chess', 0, ?2, '', 'waiting', ?3)",
            params![covenant_id, p1, p1_token],
        )
        .expect("seed one-player waiting row");
    }

    /// Two BIP340-shaped 32-byte testnet addresses sourced from existing in-tree
    /// tests (`kaspa_msg.rs`). Real schnorr x-only keys, so `xonly_hex_from_address`
    /// would accept them; we only need them to be DISTINCT and well-formed.
    const P1_ADDR: &str = "kaspatest:qpkke2kzfzheda405lusfa2sy5aq70hn7k4zle5r322my9nfz35wyz3plwfst";
    const P2_ADDR: &str = "kaspatest:qprx6l72u437tjcf5rgcwza4sq6ysprp0pu6zj2feu3zshcm4cljwrzqrunpu";

    /// (a) lock_pot fails CLOSED when the caller does not supply a valid seat
    /// token. authorize_money_caller rejects an empty/missing token before any
    /// row lookup, so the response is `{success:false, error:...}` and no
    /// covenant_builder call is ever issued.
    #[tokio::test]
    async fn lock_pot_rejects_missing_seat_token() {
        let db = fresh_db();
        // Even with a seeded valid two-player match, calling lock_pot WITHOUT
        // any token must be rejected on the auth gate.
        seed_two_player_active(&db, "cov-a", P1_ADDR, P2_ADDR, "tok-p1", "tok-p2");
        let body = json!({ "stake_kas": 1.0, "network": "testnet-12" });
        let resp = lock_pot(Extension(db), Path("cov-a".into()), Json(body))
            .await
            .0;
        assert_eq!(
            resp["success"],
            json!(false),
            "auth gate must fail closed without a seat token"
        );
        let err = resp["error"].as_str().unwrap_or("");
        assert!(
            err.contains("seat token"),
            "error must name the missing seat token, got: {err}"
        );
    }

    /// (b) lock_pot rejects a 1-player match: oracle_escrow needs BOTH player
    /// pubkeys to build the 3-of-N redeem [oracle, p1, p2], so we must refuse
    /// before any prepare-deploy call. Auth passes (we supply a real token);
    /// the precondition is what fails.
    #[tokio::test]
    async fn lock_pot_rejects_single_player_match() {
        let db = fresh_db();
        seed_one_player_waiting(&db, "cov-b", P1_ADDR, "tok-p1");
        let body = json!({ "token": "tok-p1", "stake_kas": 1.0, "network": "testnet-12" });
        let resp = lock_pot(Extension(db), Path("cov-b".into()), Json(body))
            .await
            .0;
        assert_eq!(resp["success"], json!(false));
        let err = resp["error"].as_str().unwrap_or("");
        assert!(
            err.contains("two players"),
            "error must explain the two-player precondition, got: {err}"
        );
    }

    /// (c) submit_pot rejects a call that does not echo back a real prepare
    /// session_id (+ signature_hex). Replay/forgery protection: without the
    /// session_id minted by lock_pot, the handler cannot reconstruct the
    /// PendingDeploy the funder is supposed to be signing, so it must refuse.
    /// Auth passes (real token); the missing session_id is what fails.
    #[tokio::test]
    async fn submit_pot_rejects_empty_session_id() {
        let db = fresh_db();
        seed_two_player_active(&db, "cov-c", P1_ADDR, P2_ADDR, "tok-p1", "tok-p2");
        // Real token, but no session_id and no signature_hex - the gate that
        // protects against replaying / forging a submit without a matching
        // prepare must fail closed.
        let body = json!({ "token": "tok-p1", "session_id": "", "signature_hex": "" });
        let resp = submit_pot(Extension(db), Path("cov-c".into()), Json(body))
            .await
            .0;
        assert_eq!(resp["success"], json!(false));
        let err = resp["error"].as_str().unwrap_or("");
        assert!(
            err.contains("session_id") && err.contains("signature_hex"),
            "error must require session_id + signature_hex from lock-pot, got: {err}"
        );
    }

    /// (d) settle_pot fails CLOSED on the same seat-token gate as lock_pot,
    /// even on a finished match. A settle without a valid token cannot move
    /// the pot regardless of what `winner` says in the DB.
    #[tokio::test]
    async fn settle_pot_rejects_missing_seat_token() {
        let db = fresh_db();
        seed_two_player_active(&db, "cov-d", P1_ADDR, P2_ADDR, "tok-p1", "tok-p2");
        // Mark the match finished with a winner so we are testing the auth gate
        // specifically, not the "no winner yet" precondition.
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "UPDATE skill_games SET status = 'finished', winner = 'white', end_reason = 'board' WHERE covenant_id = ?1",
                params!["cov-d"],
            ).unwrap();
        }
        // No `token` field at all -> AuthReq deserialises with token = None ->
        // authorize_money_caller sees an empty supplied token and refuses.
        let body = json!({});
        let auth: AuthReq = serde_json::from_value(body).expect("AuthReq parses empty body");
        let resp = settle_pot(Extension(db), Path("cov-d".into()), Json(auth))
            .await
            .0;
        assert_eq!(
            resp["success"],
            json!(false),
            "settle must fail closed without a seat token"
        );
        let err = resp["error"].as_str().unwrap_or("");
        assert!(
            err.contains("seat token"),
            "error must name the missing seat token, got: {err}"
        );
    }

    /// (e) claim_timeout enforces the server-authoritative clock and does NOT
    /// fire while the side-to-move still has budget left.
    ///
    /// Honesty note: skill-game claim_timeout is a CLOCK gate (turn_started_at
    /// + p{1,2}_time_ms), not a DAA gate. The DAA-locked refund branch lives
    /// on the channel pot's CLTV path (refund_channel) and is a separate test.
    /// What we assert here is the analogous "do not fire before the threshold"
    /// property: a freshly-started turn with a full 5-minute budget returns
    /// timed_out=false and leaves the match active.
    #[tokio::test]
    async fn claim_timeout_does_not_fire_before_clock_expires() {
        let db = fresh_db();
        // seed_two_player_active sets turn_started_at = now and a full 300s
        // budget on both clocks, so 0 ms have elapsed for the side to move.
        seed_two_player_active(&db, "cov-e", P1_ADDR, P2_ADDR, "tok-p1", "tok-p2");
        let resp = claim_timeout(Extension(db.clone()), Path("cov-e".into()))
            .await
            .0;
        assert_eq!(resp["success"], json!(true));
        assert_eq!(
            resp["timed_out"],
            json!(false),
            "claim_timeout must not fire while the mover still has clock budget"
        );
        // The row is still active and still belongs to the same mover - the
        // server did NOT flip status to 'finished' or pick a winner.
        let conn = db.lock().unwrap();
        let (status, winner): (String, Option<String>) = conn
            .query_row(
                "SELECT status, winner FROM skill_games WHERE covenant_id = ?1",
                params!["cov-e"],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "active");
        assert!(
            winner.is_none(),
            "no winner may be written before the clock expires"
        );
    }

    // ── De-oracle hashlock games money path (DEORACLE_PLAN stage 2/3) ──

    /// Insert a hashlock pot row directly: a 2-player match with pot_tx linked,
    /// settle_mode='hashlock', and match_id bound. `status`/`end_reason`/`winner`/
    /// `moves` let a test drive the money gate (game_pot_outcome) to a decisive
    /// or rejected result without a chain. game_type 'chess' has a server engine.
    #[allow(clippy::too_many_arguments)]
    fn seed_hashlock_pot(
        db: &Db,
        covenant_id: &str,
        pot_tx: &str,
        status: &str,
        end_reason: Option<&str>,
        winner: Option<&str>,
    ) {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO skill_games (covenant_id, game_type, pot_amount_kas, player1, player2, status, p1_token, p2_token, turn_started_at, p1_time_ms, p2_time_ms, pot_tx, settle_mode, match_id, end_reason, winner, moves) \
             VALUES (?1, 'chess', 1.0, ?2, ?3, ?4, 'tok-p1', 'tok-p2', unixepoch(), 300000, 300000, ?5, 'hashlock', ?1, ?6, ?7, '[]')",
            params![covenant_id, P1_ADDR, P2_ADDR, status, pot_tx, end_reason, winner],
        )
        .expect("seed hashlock pot row");
    }

    /// Record the pot UTXO's network in `p2sh_covenants` (keyed by pot_tx), which is
    /// where `load_hashlock_pot` reads the network from. Used to drive the settle
    /// handler onto the MAINNET branch (where a verified ZK receipt is forced
    /// mandatory) without standing up a chain. Other columns are filler that the
    /// settle path never reads.
    fn seed_pot_network(db: &Db, pot_tx: &str, network: &str) {
        let conn = db.lock().unwrap();
        conn.execute(
            "INSERT INTO p2sh_covenants (tx_id, network, p2sh_address, redeem_script_hex, redeem_kind, amount_sompi, outpoint_index, owner_addr, created_at) \
             VALUES (?1, ?2, 'p2sh:test', '00', 'binary_oracle_select', 100000000, 0, ?3, unixepoch())",
            params![pot_tx, network, P1_ADDR],
        )
        .expect("seed p2sh_covenants network row");
    }

    /// REFEREE determinism + binding (mirrors referee.rs unit tests at the games
    /// boundary): the per-outcome secret and hashlock are deterministic, the
    /// hashlock is blake2b256(secret), and different matches/outcomes are
    /// independent so a loser's or a wrong-match secret never satisfies the
    /// winner's branch hash.
    #[test]
    fn referee_hashlock_is_deterministic_and_bound() {
        let net = "testnet-12";
        let s = crate::referee::outcome_secret(net, "match-1", 0);
        assert_eq!(
            s,
            crate::referee::outcome_secret(net, "match-1", 0),
            "secret must be deterministic"
        );
        assert_eq!(
            crate::referee::outcome_hashlock(net, "match-1", 0),
            crate::covenant_builder::blake2b256(&s),
            "hashlock == blake2b256(secret)"
        );
        // Cross-match and cross-outcome independence (request_id-style binding).
        assert_ne!(
            crate::covenant_builder::blake2b256(&crate::referee::outcome_secret(net, "match-1", 0)),
            crate::referee::outcome_hashlock(net, "match-2", 0),
            "match-1's secret must not satisfy match-2's hashlock"
        );
        assert_ne!(
            crate::covenant_builder::blake2b256(&crate::referee::outcome_secret(net, "match-1", 0)),
            crate::referee::outcome_hashlock(net, "match-1", 1),
            "the loser's secret must not satisfy the winner's branch hashlock"
        );
    }

    /// A hashlock pot's redeem must embed NEITHER the Covex oracle xonly NOR the
    /// referee xonly: only the two player keys, the two referee HASHLOCKS, and the
    /// funder refund key. We build the exact redeem the hashlock lock-pot path
    /// produces (binary_oracle_select with referee hashlocks + player keys) and
    /// assert both control keys are absent and both hashlocks are present.
    #[test]
    fn hashlock_pot_redeem_has_no_oracle_or_referee_key() {
        let net = "testnet-12";
        let domain = "match-redeem-check";
        // A throwaway oracle key so oracle_xonly_pubkey_hex() does not fail closed
        // in this test (env is process-global; we only SET it, never assert unset).
        std::env::set_var("COVEX_ORACLE_KEY", "11".repeat(32));

        let h_a = crate::referee::outcome_hashlock(net, domain, 0);
        let h_b = crate::referee::outcome_hashlock(net, domain, 1);
        // Player x-only keys from the test addresses (same derivation lock-pot uses).
        let p1x_hex = xonly_hex_from_address(P1_ADDR).expect("p1 xonly");
        let p2x_hex = xonly_hex_from_address(P2_ADDR).expect("p2 xonly");
        let to32 = |h: &str| -> [u8; 32] {
            let b = hex::decode(h).unwrap();
            let mut a = [0u8; 32];
            a.copy_from_slice(&b);
            a
        };
        let p1x = to32(&p1x_hex);
        let p2x = to32(&p2x_hex);
        // refund = funder = player1.
        let redeem = crate::covenant_builder::redeem_binary_oracle_select(
            &h_a, &p1x, &h_b, &p2x, 720, &p1x,
        )
        .expect("build binary_oracle_select redeem");
        let redeem_hex = hex::encode(&redeem).to_lowercase();

        let oracle_x = crate::oracle::oracle_xonly_pubkey_hex().to_lowercase();
        let referee_x = crate::referee::referee_xonly_pubkey_hex(net).to_lowercase();
        assert!(
            !redeem_hex.contains(&oracle_x),
            "hashlock pot redeem must NOT contain the Covex oracle key"
        );
        assert!(
            !redeem_hex.contains(&referee_x),
            "hashlock pot redeem must NOT contain the referee key (the referee is never a signer)"
        );
        // The redeem DOES bind the referee hashlocks and both player keys.
        assert!(
            redeem_hex.contains(&hex::encode(h_a)),
            "redeem must embed referee hashlock A"
        );
        assert!(
            redeem_hex.contains(&hex::encode(h_b)),
            "redeem must embed referee hashlock B"
        );
        assert!(redeem_hex.contains(&p1x_hex.to_lowercase()), "redeem embeds player1 key");
        assert!(redeem_hex.contains(&p2x_hex.to_lowercase()), "redeem embeds player2 key");
    }

    /// The hashlock settle MONEY GATE fails closed when game_pot_outcome cannot
    /// prove a winner: a pot whose match is NOT finished is refused BEFORE any
    /// secret is revealed or any spend is built. (game_pot_outcome rejects a
    /// non-finished match.)
    #[tokio::test]
    async fn settle_pot_hashlock_fails_closed_when_outcome_undecided() {
        let db = fresh_db();
        // Active (not finished) match with a linked hashlock pot. game_pot_outcome
        // will Reject ("match is not finished"), so the settle must refuse.
        seed_hashlock_pot(&db, "cov-hl-1", "pot-hl-1", "active", None, None);
        let resp = settle_pot_hashlock(
            Extension(db),
            Path("cov-hl-1".into()),
            Json(json!({ "token": "tok-p1" })),
        )
        .await
        .0;
        assert_eq!(
            resp["success"],
            json!(false),
            "an undecided match must not settle a hashlock pot"
        );
        let err = resp["error"].as_str().unwrap_or("");
        assert!(
            err.contains("settle refused") || err.contains("not finished"),
            "rejection must come from the fail-closed money gate, got: {err}"
        );
        // Crucially, NO preimage (referee secret) is leaked on a refused settle.
        assert!(
            resp.get("preimage_hex").is_none(),
            "no referee secret may be revealed when the outcome is undecided"
        );
    }

    /// The hashlock settle requires a valid seat token (fail-closed auth), same as
    /// the legacy settle-pot. An empty token is rejected before any DB lookup.
    #[tokio::test]
    async fn settle_pot_hashlock_rejects_missing_seat_token() {
        let db = fresh_db();
        seed_hashlock_pot(&db, "cov-hl-2", "pot-hl-2", "active", None, None);
        let resp = settle_pot_hashlock(
            Extension(db),
            Path("cov-hl-2".into()),
            Json(json!({})),
        )
        .await
        .0;
        assert_eq!(resp["success"], json!(false));
        assert!(resp["error"]
            .as_str()
            .unwrap_or("")
            .contains("seat token"));
    }

    /// The hashlock refund is restricted to the FUNDER (player1): a player2 seat
    /// token is rejected on the refund branch (only the funder's key can take the
    /// CSV refund).
    #[tokio::test]
    async fn refund_pot_hashlock_only_funder() {
        let db = fresh_db();
        seed_hashlock_pot(&db, "cov-hl-3", "pot-hl-3", "active", None, None);
        // player2's token -> rejected (not the funder).
        let resp = refund_pot_hashlock(
            Extension(db),
            Path("cov-hl-3".into()),
            Json(AuthReq {
                token: Some("tok-p2".into()),
            }),
        )
        .await
        .0;
        assert_eq!(resp["success"], json!(false));
        assert!(
            resp["error"].as_str().unwrap_or("").contains("funder"),
            "player2 must be told only the funder may refund"
        );
    }

    /// A pot locked on the LEGACY oracle_escrow path must NOT be settle-able via the
    /// hashlock endpoint (and vice versa): the hashlock settle refuses a pot whose
    /// settle_mode is not 'hashlock', so the two paths never cross.
    #[tokio::test]
    async fn settle_pot_hashlock_refuses_legacy_oracle_pot() {
        let db = fresh_db();
        // Seed a pot but mark it oracle_escrow (legacy), with a finished decisive
        // board so the ONLY thing that can refuse is the settle_mode guard.
        {
            let conn = db.lock().unwrap();
            conn.execute(
                "INSERT INTO skill_games (covenant_id, game_type, pot_amount_kas, player1, player2, status, p1_token, p2_token, turn_started_at, p1_time_ms, p2_time_ms, pot_tx, settle_mode, end_reason, winner, moves) \
                 VALUES (?1, 'chess', 1.0, ?2, ?3, 'finished', 'tok-p1', 'tok-p2', unixepoch(), 300000, 300000, 'pot-legacy', 'oracle_escrow', 'timeout', 'player1', '[]')",
                params!["cov-hl-4", P1_ADDR, P2_ADDR],
            )
            .expect("seed legacy oracle pot");
        }
        let resp = settle_pot_hashlock(
            Extension(db),
            Path("cov-hl-4".into()),
            Json(json!({ "token": "tok-p1" })),
        )
        .await
        .0;
        assert_eq!(resp["success"], json!(false));
        assert!(
            resp["error"]
                .as_str()
                .unwrap_or("")
                .contains("not a hashlock pot"),
            "a legacy oracle_escrow pot must be routed away from the hashlock settle"
        );
    }

    /// ZK gate: a SUPPLIED receipt with NO verifier binary provisioned must REFUSE the
    /// settle (never accept an unverified proof as if real), and NO referee secret leaks.
    /// Uses a finished decisive board so only the ZK gate can be the refuser.
    #[tokio::test]
    async fn settle_pot_hashlock_refuses_unverifiable_supplied_proof() {
        std::env::remove_var("COVEX_GAMES_PROVER_BIN");
        std::env::remove_var("COVEX_GAMES_ZK_REQUIRE");
        let db = fresh_db();
        // Finished, server-timed timeout to player1 so game_pot_outcome Verifies(0); the
        // ONLY remaining gate is the ZK gate, which must refuse a proof it cannot verify.
        seed_hashlock_pot(
            &db,
            "cov-hl-zk1",
            "pot-hl-zk1",
            "finished",
            Some("timeout"),
            Some("player1"),
        );
        let resp = settle_pot_hashlock(
            Extension(db),
            Path("cov-hl-zk1".into()),
            Json(json!({ "token": "tok-p1", "receipt_b64": "Zm9vYmFy" })),
        )
        .await
        .0;
        assert_eq!(
            resp["success"],
            json!(false),
            "a supplied proof with no verifier must refuse, not accept"
        );
        assert!(
            resp["error"].as_str().unwrap_or("").contains("ZK winner-proof gate"),
            "the refusal must come from the ZK gate, got: {}",
            resp["error"]
        );
        assert!(
            resp.get("preimage_hex").is_none(),
            "no referee secret may leak when the ZK gate refuses"
        );
    }

    /// MAINNET hardening (task 1): on a MAINNET pot, a hashlock settle with NO receipt is
    /// REFUSED even though the env flag COVEX_GAMES_ZK_REQUIRE is off, because mainnet forces
    /// a verified zkVM proof mandatory. The refusal is clear (names the ZK gate) and NO referee
    /// secret leaks (preimage_hex absent). The match is a finished, server-timed timeout to
    /// player1 so game_pot_outcome Verifies(0) and the ONLY remaining gate is the (forced) ZK
    /// gate. The pot's network is recorded as mainnet in p2sh_covenants so load_hashlock_pot
    /// returns net="mainnet". REFEREE_KEY is set to a throwaway 64-hex value so referee
    /// derivation would NOT fail-closed on mainnet for an unrelated reason (we are proving the
    /// ZK gate refuses, not the referee-key gate).
    #[tokio::test]
    async fn settle_pot_hashlock_mainnet_refuses_without_zk_receipt() {
        // Env flag OFF (the whole point: mainnet must require a proof regardless).
        std::env::remove_var("COVEX_GAMES_ZK_REQUIRE");
        std::env::remove_var("COVEX_GAMES_PROVER_BIN");

        let db = fresh_db();
        seed_hashlock_pot(
            &db,
            "cov-hl-mn",
            "pot-hl-mn",
            "finished",
            Some("timeout"),
            Some("player1"),
        );
        // Drive load_hashlock_pot onto the MAINNET branch.
        seed_pot_network(&db, "pot-hl-mn", "mainnet");

        let resp = settle_pot_hashlock(
            Extension(db),
            Path("cov-hl-mn".into()),
            // No receipt_b64/receipt_hex: the proof is absent.
            Json(json!({ "token": "tok-p1" })),
        )
        .await
        .0;

        assert_eq!(
            resp["success"],
            json!(false),
            "mainnet settle with no receipt must be refused even with COVEX_GAMES_ZK_REQUIRE off"
        );
        let err = resp["error"].as_str().unwrap_or("");
        assert!(
            err.contains("ZK winner-proof gate"),
            "the refusal must come from the ZK gate, got: {err}"
        );
        assert!(
            err.contains("mainnet"),
            "the error must explain mainnet forces a proof, got: {err}"
        );
        assert!(
            resp.get("preimage_hex").is_none(),
            "no referee secret may leak when mainnet refuses a proofless settle"
        );
    }
}
