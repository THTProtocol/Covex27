//! Persistent skill games: join, move, and state APIs over the existing
//! skill_games table, with live WebSocket fan-out so opponents and
//! spectators sync in real time. Stakes stay on-chain; this is game-state
//! coordination only and the oracle still signs final outcomes.

use axum::{
    extract::{Path, Query},
    routing::{get, post},
    Extension, Json, Router,
};
use rusqlite::params;
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::live;

pub fn games_routes() -> Router {
    Router::new()
        .route("/games", get(list_games))
        .route("/games/:covenant_id", get(get_game))
        .route("/games/:covenant_id/join", post(join_game))
        .route("/games/:covenant_id/move", post(make_move))
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
        let row: Option<(String, String, String, String, String)> = conn
            .query_row(
                "SELECT player1, player2, moves, current_turn, status FROM skill_games WHERE covenant_id = ?1",
                params![covenant_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .ok();
        match row {
            None => Err("no match for this covenant; join first".to_string()),
            Some((p1, p2, moves_raw, turn, status)) => {
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
                        let next = if turn == "white" { "black" } else { "white" };
                        let finished = req.finished.unwrap_or(false);
                        let new_status = if finished { "finished" } else { "active" };
                        conn.execute(
                            "UPDATE skill_games SET moves = ?1, current_turn = ?2, status = ?3, winner = ?4, updated_at = unixepoch() WHERE covenant_id = ?5",
                            params![
                                serde_json::to_string(&moves).unwrap_or_else(|_| "[]".into()),
                                next,
                                new_status,
                                req.winner,
                                covenant_id
                            ],
                        )
                        .map(|_| ())
                        .map_err(|e| e.to_string())
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
