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
    }))
}

const GAME_SELECT: &str = "SELECT covenant_id, game_type, pot_amount_kas, player1, player2, moves, current_turn, winner, status, created_at, updated_at, p1_time_ms, p2_time_ms, turn_started_at, end_reason, unixepoch(), pot_tx, pot_payout_tx FROM skill_games";

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

/// POST /games/:id/lock-pot {token, stake_kas, network?} : PREPARE a real on-chain pot for
/// this match in an oracle_escrow covenant [oracle, player1, player2]. The chain releases the
/// pot ONLY to the oracle-declared winner (settle-pot). NON-CUSTODIAL: this returns the
/// UNSIGNED funding tx + sighash for player1's browser wallet to sign (no use_dev_mode, the
/// server never holds player1's key). player1 signs and POSTs {session_id, signature_hex,
/// token} to /games/:id/submit-pot, which broadcasts and links the pot to this match.
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
    let p1x = match xonly_hex_from_address(&p1) {
        Ok(x) => x,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };
    let p2x = match xonly_hex_from_address(&p2) {
        Ok(x) => x,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };

    // NON-CUSTODIAL: build the UNSIGNED oracle_escrow funding tx and return its sighash for
    // player1's browser wallet to sign. No use_dev_mode, so the server never holds player1's
    // key. The funder signs `sighash` and POSTs {session_id, signature_hex, token} to
    // /games/:id/submit-pot, which broadcasts and links pot_tx to this match for the gate.
    let preq: crate::covenant_builder::PrepareDeployRequest = match serde_json::from_value(json!({
        "network": net, "deployer_addr": p1, "stake_kas": stake,
        "redeem": { "kind": "oracle_escrow", "pubkeys_hex": [p1x, p2x] }
    })) {
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
        v["next"] = json!(format!(
            "Sign `sighash` (BIP340 Schnorr) with player1's wallet, then POST {{session_id, signature_hex, token}} to /games/{covenant_id}/submit-pot to broadcast and link the pot."
        ));
    }
    Json(v)
}

/// POST /games/:id/submit-pot {token, session_id, signature_hex} : broadcast the player1-signed
/// oracle_escrow funding tx (non-custodial; the server never held player1's key) and LINK the
/// resulting pot to this match so settle-pot's money gate (game_pot_outcome) can resolve it.
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
            let conn = db.lock().unwrap();
            let _ = conn.execute(
                "UPDATE skill_games SET pot_tx = ?1, pot_amount_kas = ?2, updated_at = unixepoch() WHERE covenant_id = ?3",
                params![tx, kas, covenant_id],
            );
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
}
