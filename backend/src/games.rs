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
use std::sync::{Arc, Mutex};

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
        .route("/games/:covenant_id/settle-pot", post(settle_pot))
        .route("/games/:covenant_id/lock-channel", post(lock_channel))
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

/// Background sweep: finalise active matches whose side-to-move has run its clock out
/// when neither client called claim-timeout (e.g. both closed the tab). Recorded as
/// end_reason='abandon' - server-timed, so it may settle a real pot to the winner.
pub fn spawn_timeout_sweeper(db: Arc<Mutex<rusqlite::Connection>>) {
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
                        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
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
                        let (np1, np2) = if turn == "white" { (0i64, p2ms) } else { (p1ms, 0i64) };
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
    let moves: serde_json::Value =
        serde_json::from_str(&moves_raw).unwrap_or_else(|_| json!([]));
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
    }))
}

const GAME_SELECT: &str = "SELECT covenant_id, game_type, pot_amount_kas, player1, player2, moves, current_turn, winner, status, created_at, updated_at, p1_time_ms, p2_time_ms, turn_started_at, end_reason, unixepoch() FROM skill_games";

fn fetch_game(
    db: &Mutex<rusqlite::Connection>,
    covenant_id: &str,
) -> Option<serde_json::Value> {
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
        return Err(format!("address '{addr}' is not a 32-byte schnorr key (payload {} bytes)", p.len()));
    }
    Ok(hex::encode(p))
}

/// POST /games/:id/lock-pot {stake_kas, network?} : lock a real on-chain pot for this
/// match into an oracle_escrow covenant [oracle, player1, player2]. The chain will then
/// release the pot ONLY to the oracle-declared winner (settle-pot). Funded by player1
/// via the testnet dev wallet, so both players must be dev wallets for this demo flow.
async fn lock_pot(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Path(covenant_id): Path<String>,
    Json(req): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    let p2 = game["player2"].as_str().unwrap_or("").to_string();
    if p1.is_empty() || p2.is_empty() {
        return Json(json!({ "success": false, "error": "game needs two players before locking a pot" }));
    }
    let stake = req.get("stake_kas").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if !(stake > 0.0) {
        return Json(json!({ "success": false, "error": "stake_kas must be > 0" }));
    }
    let net = req.get("network").and_then(|v| v.as_str()).unwrap_or("testnet-12").to_string();
    let p1x = match xonly_hex_from_address(&p1) { Ok(x) => x, Err(e) => return Json(json!({ "success": false, "error": e })) };
    let p2x = match xonly_hex_from_address(&p2) { Ok(x) => x, Err(e) => return Json(json!({ "success": false, "error": e })) };

    let dreq: crate::covenant_builder::P2shDeployRequest = match serde_json::from_value(json!({
        "network": net, "deployer_addr": p1, "use_dev_mode": true, "stake_kas": stake,
        "redeem": { "kind": "oracle_escrow", "pubkeys_hex": [p1x, p2x] }
    })) {
        Ok(r) => r,
        Err(e) => return Json(json!({ "success": false, "error": format!("build deploy request: {e}") })),
    };
    let v = crate::covenant_builder::p2sh_deploy_handler(Extension(db.clone()), Json(dreq)).await.0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        if let Some(tx) = v.get("deploy_tx_id").and_then(|t| t.as_str()) {
            let conn = db.lock().unwrap();
            let _ = conn.execute(
                "UPDATE skill_games SET pot_tx = ?1, pot_amount_kas = ?2, updated_at = unixepoch() WHERE covenant_id = ?3",
                params![tx, stake, covenant_id],
            );
        }
    }
    Json(v)
}

/// POST /games/:id/settle-pot : release the locked pot to the game's winner. The winner
/// is read from the finished match, mapped to outcome 0 (player1) / 1 (player2), and the
/// oracle co-signs the payout ONLY because the outcome verifies - so the chain itself
/// paid the winner.
async fn settle_pot(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
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
            .query_row("SELECT pot_tx FROM skill_games WHERE covenant_id = ?1", params![covenant_id], |r| r.get(0))
            .ok()
            .flatten();
        let net = pot
            .as_ref()
            .and_then(|t| conn.query_row("SELECT network FROM p2sh_covenants WHERE tx_id = ?1", params![t], |r| r.get::<_, String>(0)).ok())
            .unwrap_or_else(|| "testnet-12".to_string());
        (pot, net)
    };
    let pot_tx = match pot_tx {
        Some(t) if !t.is_empty() => t,
        _ => return Json(json!({ "success": false, "error": "no pot locked for this game (call lock-pot first)" })),
    };

    let wl = winner.to_lowercase();
    let outcome: u32 = if winner == p1 || wl == "white" || wl == "player1" {
        0
    } else if winner == p2 || wl == "black" || wl == "player2" {
        1
    } else {
        return Json(json!({ "success": false, "error": format!("cannot map winner '{winner}' to player1/player2") }));
    };
    let dest = if outcome == 0 { &p1 } else { &p2 };

    let preq: crate::covenant_builder::OraclePayoutRequest = match serde_json::from_value(json!({
        "network": net, "deploy_tx_id": pot_tx, "use_dev_mode": true, "destination_addr": dest,
        "circuit_type": format!("{}_v1", gt), "proof": {}, "public_inputs": [], "requested_outcome": outcome
    })) {
        Ok(r) => r,
        Err(e) => return Json(json!({ "success": false, "error": format!("build payout request: {e}") })),
    };
    let v = crate::covenant_builder::oracle_payout_handler(Extension(db.clone()), Json(preq)).await.0;
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

/// POST /games/:id/lock-channel {stake_kas, network?} : the TRUSTLESS games pot. Locks
/// the stake into a 2-of-2 multisig between the two PLAYERS only - there is NO Covex
/// oracle key in the redeem, so Covex can never move the funds. The pot releases only
/// when both players co-sign (cooperative close to the agreed winner, see settle-channel)
/// or, in the full state-channel design, via a CLTV-timeout default. The dev flow funds
/// via player1 and both keys are dev wallets, so it exercises the mechanism end to end;
/// production has each player's own wallet sign its half.
async fn lock_channel(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Path(covenant_id): Path<String>,
    Json(req): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let game = match fetch_game(&db, &covenant_id) {
        Some(g) => g,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    let p1 = game["player1"].as_str().unwrap_or("").to_string();
    let p2 = game["player2"].as_str().unwrap_or("").to_string();
    if p1.is_empty() || p2.is_empty() {
        return Json(json!({ "success": false, "error": "game needs two players before locking a channel" }));
    }
    let stake = req.get("stake_kas").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if !(stake > 0.0) {
        return Json(json!({ "success": false, "error": "stake_kas must be > 0" }));
    }
    let net = req.get("network").and_then(|v| v.as_str()).unwrap_or("testnet-12").to_string();
    // refund_after_daa: the absolute DAA after which the funder may reclaim if there is no
    // cooperative close (so a vanished counterparty cannot freeze the pot). The caller
    // (frontend) passes the current node DAA plus a window from /api/status.
    let refund_after_daa = match req.get("refund_after_daa").and_then(|v| v.as_u64()) {
        Some(d) => d,
        None => return Json(json!({ "success": false, "error": "lock-channel requires refund_after_daa (current node DAA + a refund window)" })),
    };
    let p1x = match xonly_hex_from_address(&p1) { Ok(x) => x, Err(e) => return Json(json!({ "success": false, "error": e })) };
    let p2x = match xonly_hex_from_address(&p2) { Ok(x) => x, Err(e) => return Json(json!({ "success": false, "error": e })) };

    // Trustless channel: cooperative 2-of-2 [player1, player2] close OR a funder refund
    // after refund_after_daa. NO oracle pubkey - Covex is never in the payout path.
    let dreq: crate::covenant_builder::P2shDeployRequest = match serde_json::from_value(json!({
        "network": net, "deployer_addr": p1, "use_dev_mode": true, "stake_kas": stake,
        "redeem": { "kind": "channel", "pubkeys_hex": [p1x, p2x], "lock_daa": refund_after_daa }
    })) {
        Ok(r) => r,
        Err(e) => return Json(json!({ "success": false, "error": format!("build channel deploy: {e}") })),
    };
    let v = crate::covenant_builder::p2sh_deploy_handler(Extension(db.clone()), Json(dreq)).await.0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        if let Some(tx) = v.get("deploy_tx_id").and_then(|t| t.as_str()) {
            let conn = db.lock().unwrap();
            let _ = conn.execute(
                "UPDATE skill_games SET pot_tx = ?1, pot_amount_kas = ?2, updated_at = unixepoch() WHERE covenant_id = ?3",
                params![tx, stake, covenant_id],
            );
        }
    }
    Json(v)
}

/// POST /games/:id/settle-channel : cooperative close. Reads the SERVER-VERIFIED winner
/// and releases the 2-of-2 player pot to them with BOTH players' signatures. No Covex
/// oracle key is ever used - the chain pays the winner purely on the two players'
/// co-signature. (Dev flow signs both dev wallets to exercise it; production has each
/// player sign its half. A non-cooperating loser is handled by the CLTV-timeout default
/// in the full state-channel build.)
async fn settle_channel(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
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
            .query_row("SELECT pot_tx FROM skill_games WHERE covenant_id = ?1", params![covenant_id], |r| r.get(0))
            .ok()
            .flatten();
        let net = pot
            .as_ref()
            .and_then(|t| conn.query_row("SELECT network FROM p2sh_covenants WHERE tx_id = ?1", params![t], |r| r.get::<_, String>(0)).ok())
            .unwrap_or_else(|| "testnet-12".to_string());
        (pot, net)
    };
    let pot_tx = match pot_tx {
        Some(t) if !t.is_empty() => t,
        _ => return Json(json!({ "success": false, "error": "no channel pot locked (call lock-channel first)" })),
    };
    let wl = winner.to_lowercase();
    let dest = if winner == p1 || wl == "white" || wl == "player1" {
        &p1
    } else if winner == p2 || wl == "black" || wl == "player2" {
        &p2
    } else {
        return Json(json!({ "success": false, "error": format!("cannot map winner '{winner}' to a player") }));
    };
    // 2-of-2 cooperative close: spend the multisig pot to the winner. The spend handler
    // uses both players' keys (dev wallets in dev mode); NO oracle key is involved.
    let sreq: crate::covenant_builder::P2shSpendRequest = match serde_json::from_value(json!({
        "network": net, "deploy_tx_id": pot_tx, "use_dev_mode": true, "destination_addr": dest
    })) {
        Ok(r) => r,
        Err(e) => return Json(json!({ "success": false, "error": format!("build channel close: {e}") })),
    };
    let v = crate::covenant_builder::p2sh_spend_handler(Extension(db.clone()), Json(sreq)).await.0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        if let Some(tx) = v.get("spend_tx_id").and_then(|t| t.as_str()) {
            let conn = db.lock().unwrap();
            let _ = conn.execute(
                "UPDATE skill_games SET pot_payout_tx = ?1, updated_at = unixepoch() WHERE covenant_id = ?2",
                params![tx, covenant_id],
            );
        }
    }
    Json(v)
}

/// POST /games/:id/refund-channel : the funder (player1) reclaims the channel pot via the
/// timeout branch when there was no cooperative close (e.g. the opponent vanished). The
/// spend sets lock_time to the channel's refund_after_daa, so the node rejects it until
/// the chain reaches that DAA. No oracle key - the funder always recovers after the
/// timeout, so the pot can never be frozen.
async fn refund_channel(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
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
            .query_row("SELECT pot_tx FROM skill_games WHERE covenant_id = ?1", params![covenant_id], |r| r.get(0))
            .ok()
            .flatten();
        let net = pot
            .as_ref()
            .and_then(|t| conn.query_row("SELECT network FROM p2sh_covenants WHERE tx_id = ?1", params![t], |r| r.get::<_, String>(0)).ok())
            .unwrap_or_else(|| "testnet-12".to_string());
        (pot, net)
    };
    let pot_tx = match pot_tx {
        Some(t) if !t.is_empty() => t,
        _ => return Json(json!({ "success": false, "error": "no channel pot locked" })),
    };
    let sreq: crate::covenant_builder::P2shSpendRequest = match serde_json::from_value(json!({
        "network": net, "deploy_tx_id": pot_tx, "use_dev_mode": true, "destination_addr": p1, "channel_mode": "refund"
    })) {
        Ok(r) => r,
        Err(e) => return Json(json!({ "success": false, "error": format!("build channel refund: {e}") })),
    };
    let v = crate::covenant_builder::p2sh_spend_handler(Extension(db.clone()), Json(sreq)).await.0;
    if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
        if let Some(tx) = v.get("spend_tx_id").and_then(|t| t.as_str()) {
            let conn = db.lock().unwrap();
            let _ = conn.execute(
                "UPDATE skill_games SET pot_payout_tx = ?1, updated_at = unixepoch() WHERE covenant_id = ?2",
                params![tx, covenant_id],
            );
        }
    }
    Json(v)
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
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
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
                    if req.player == p1 { &p1_token } else { &p2_token },
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
            live::publish("game_move", json!({"covenant_id": covenant_id, "game": game}));
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
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
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
                    let elapsed_ms = if turn_started > 0 { (now - turn_started).max(0) * 1000 } else { 0 };
                    let budget = if turn == "white" { p1_ms } else { p2_ms };
                    if budget - elapsed_ms <= 0 {
                        let win = if turn == "white" { "black" } else { "white" };
                        let (np1, np2) = if turn == "white" { (0i64, p2_ms) } else { (p1_ms, 0i64) };
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
                live::publish("game_move", json!({"covenant_id": covenant_id, "game": game}));
            }
            Json(json!({"success": true, "timed_out": timed_out, "game": game}))
        }
        Err(e) => Json(json!({"success": false, "error": e})),
    }
}

/// GET /games?status=waiting|active&limit=50 : matchmaking + arena counts.
async fn list_games(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Query(p): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let status = p.get("status").cloned().unwrap_or_else(|| "waiting".into());
    let limit: i64 = p.get("limit").and_then(|s| s.parse().ok()).unwrap_or(50).clamp(1, 200);
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
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
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
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
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
                    Ok((if status == "waiting" { "waiting" } else { "active" }, None))
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
            live::publish("game_update", json!({"covenant_id": covenant_id, "status": status, "game": game}));
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
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
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
            Some((p1, p2, moves_raw, turn, status, game_type, p1_ms, p2_ms, turn_started, now, p1_token, p2_token)) => {
                if status == "finished" {
                    Err("match already finished".to_string())
                } else if (turn == "white" && req.player != p1)
                    || (turn == "black" && req.player != p2)
                {
                    Err("not your turn".to_string())
                } else if let Err(e) = check_seat_token(
                    if turn == "white" { &p1_token } else { &p2_token },
                    req.token.as_deref().unwrap_or(""),
                ) {
                    // Only the seated client (holding the token) may submit this
                    // side's move - closes the opponent-forges-victim's-move hole.
                    Err(e)
                } else {
                    // Server-authoritative clock: charge the mover for the time spent
                    // this turn. turn_started_at and the budgets are written ONLY by the
                    // server, so a client cannot manufacture or dodge a timeout.
                    let elapsed_ms = if turn_started > 0 { (now - turn_started).max(0) * 1000 } else { 0 };
                    let mover_budget = if turn == "white" { p1_ms } else { p2_ms };
                    let mover_remaining = mover_budget - elapsed_ms;
                    if mover_remaining <= 0 {
                        // The mover's clock ran out: they lose on time (end_reason=timeout).
                        let win = if turn == "white" { "black" } else { "white" };
                        let (np1, np2) = if turn == "white" { (0i64, p2_ms) } else { (p1_ms, 0i64) };
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
                                    Some(decisive) => {
                                        Ok((true, decisive.winner_str().map(|s| s.to_string()), "board"))
                                    }
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
                                    let end_reason: Option<&str> =
                                        if finished && !reason.is_empty() { Some(reason) } else { None };
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
            live::publish("game_move", json!({"covenant_id": covenant_id, "game": game}));
            Json(json!({"success": true, "game": game}))
        }
        Err(e) => Json(json!({"success": false, "error": e})),
    }
}
