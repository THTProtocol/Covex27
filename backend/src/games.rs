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
        .route("/games/:covenant_id/lock-pot", post(lock_pot))
        .route("/games/:covenant_id/settle-pot", post(settle_pot))
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
    }))
}

const GAME_SELECT: &str = "SELECT covenant_id, game_type, pot_amount_kas, player1, player2, moves, current_turn, winner, status, created_at, updated_at FROM skill_games";

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
        match existing {
            None => {
                let gt = req.game_type.clone().unwrap_or_else(|| "chess".into());
                conn.execute(
                    "INSERT INTO skill_games (covenant_id, game_type, pot_amount_kas, player1, status) VALUES (?1, ?2, ?3, ?4, 'waiting')",
                    params![covenant_id, gt, req.pot_amount_kas.unwrap_or(0.0), req.player],
                )
                .map(|_| "waiting")
                .map_err(|e| e.to_string())
            }
            Some((p1, p2, status)) => {
                if p1 == req.player || p2 == req.player {
                    Ok(if status == "waiting" { "waiting" } else { "active" })
                } else if status == "waiting" && p2.is_empty() {
                    conn.execute(
                        "UPDATE skill_games SET player2 = ?1, status = 'active', updated_at = unixepoch() WHERE covenant_id = ?2",
                        params![req.player, covenant_id],
                    )
                    .map(|_| "active")
                    .map_err(|e| e.to_string())
                } else {
                    Err("match is full".to_string())
                }
            }
        }
    };
    match result {
        Ok(status) => {
            let game = fetch_game(&db, &covenant_id);
            live::publish("game_update", json!({"covenant_id": covenant_id, "status": status, "game": game}));
            Json(json!({"success": true, "status": status, "game": game}))
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
        let row: Option<(String, String, String, String, String, String)> = conn
            .query_row(
                "SELECT player1, player2, moves, current_turn, status, game_type FROM skill_games WHERE covenant_id = ?1",
                params![covenant_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .ok();
        match row {
            None => Err("no match for this covenant; join first".to_string()),
            Some((p1, p2, moves_raw, turn, status, game_type)) => {
                if status == "finished" {
                    Err("match already finished".to_string())
                } else if (turn == "white" && req.player != p1)
                    || (turn == "black" && req.player != p2)
                {
                    Err("not your turn".to_string())
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
                        // itself, ignoring the client's claim entirely (this is the
                        // real "prove who won"). A client cannot forge a victory.
                        // Turn ownership was enforced above, so the mover's colour
                        // is `turn`; an undecided board still permits a concession
                        // or draw-agreement (winner is not the mover) but rejects a
                        // self-declared win.
                        let claimed_finished = req.finished.unwrap_or(false);
                        let outcome: Result<(bool, Option<String>), String> =
                            match game_engine::result_from_moves(&game_type, &moves) {
                                Some(game_engine::GameResult::Unfinished) => {
                                    if claimed_finished {
                                        if req.winner.as_deref() == Some(turn.as_str()) {
                                            Err("cannot declare yourself the winner on an undecided board".to_string())
                                        } else {
                                            Ok((true, req.winner.clone()))
                                        }
                                    } else {
                                        Ok((false, None))
                                    }
                                }
                                Some(decisive) => {
                                    Ok((true, decisive.winner_str().map(|s| s.to_string())))
                                }
                                // Unsupported game type: no server replay yet, so
                                // fall back to the client-reported result (still
                                // turn-enforced; the games money path treats these
                                // as not yet server-verifiable, see oracle gate).
                                None => Ok((claimed_finished, req.winner.clone())),
                            };
                        match outcome {
                            Err(e) => Err(e),
                            Ok((finished, winner)) => {
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
                                conn.execute(
                                    "UPDATE skill_games SET moves = ?1, current_turn = ?2, status = ?3, winner = ?4, updated_at = unixepoch() WHERE covenant_id = ?5",
                                    params![
                                        serde_json::to_string(&moves).unwrap_or_else(|_| "[]".into()),
                                        next,
                                        new_status,
                                        winner,
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
