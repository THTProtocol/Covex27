// mixer.rs — Privacy Mixer pool API (Covex27)

use axum::{
    extract::{Extension, Path},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use rusqlite::Connection;

#[derive(Deserialize)]
pub struct MixerDepositInput {
    pub covenant_id: String,
    pub leaf_hash: String,
}

#[derive(Serialize)]
pub struct MixerDepositOutput {
    pub success: bool,
    pub leaf_index: Option<i64>,
    pub merkle_root: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct MixerRootOutput {
    pub covenant_id: String,
    pub merkle_root: String,
    pub leaf_count: i64,
}

#[derive(Serialize)]
pub struct MixerStatusOutput {
    pub pools: usize,
    pub total_nullifiers: i64,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Deserialize)]
pub struct MixerWithdrawInput {
    pub covenant_id: String,
    pub nullifier: String,
}

#[derive(Serialize)]
pub struct MixerWithdrawOutput {
    pub success: bool,
    pub error: Option<String>,
}

pub fn mixer_routes() -> Router {
    Router::new()
        .route("/mixer/deposit", post(deposit_handler))
        .route("/mixer/root/:covenant_id", get(root_handler))
        .route("/mixer/status", get(status_handler))
        // P0 surface completion: previously these returned empty/404 in some clients.
        // Withdraw records the nullifier (used with the privacy ZK nullifier circuit).
        // Lists are basic for now; full privacy mixer on-chain evolution later.
        .route("/mixer/withdraw", post(withdraw_handler))
        .route("/mixer/pools", get(pools_handler))
        .route("/mixer/deposits/:covenant_id", get(deposits_handler))
        .route("/mixer/nullifiers/:covenant_id", get(nullifiers_handler))
}

async fn deposit_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Json(input): Json<MixerDepositInput>,
) -> Json<MixerDepositOutput> {
    match crate::db::mixer_add_leaf(&db, &input.covenant_id, &input.leaf_hash) {
        Ok((idx, root)) => Json(MixerDepositOutput {
            success: true,
            leaf_index: Some(idx),
            merkle_root: Some(root),
            error: None,
        }),
        Err(e) => Json(MixerDepositOutput {
            success: false,
            leaf_index: None,
            merkle_root: None,
            error: Some(e.to_string()),
        }),
    }
}

async fn root_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Path(covenant_id): Path<String>,
) -> Json<MixerRootOutput> {
    let (root, count) = crate::db::mixer_get_root(&db, &covenant_id).unwrap_or(("0".to_string(), 0));
    Json(MixerRootOutput {
        covenant_id,
        merkle_root: root,
        leaf_count: count,
    })
}

async fn status_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
) -> Json<MixerStatusOutput> {
    let conn = db.lock().unwrap();
    let pools: i64 = conn
        .query_row("SELECT COUNT(*) FROM mixer_roots", [], |r| r.get(0))
        .unwrap_or(0);
    let nullifiers: i64 = conn
        .query_row("SELECT COUNT(*) FROM mixer_nullifiers", [], |r| r.get(0))
        .unwrap_or(0);
    Json(MixerStatusOutput {
        pools: pools as usize,
        total_nullifiers: nullifiers,
        note: Some("Mixer hybrid/oracle-attested stub. Deposit+root+nullifier recording active. Full on-chain privacy later (see vision).".to_string()),
    })
}

async fn withdraw_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Json(input): Json<MixerWithdrawInput>,
) -> Json<MixerWithdrawOutput> {
    // SECURITY (Finding H2): this endpoint records a withdraw nullifier but DOES NOT and
    // MUST NOT trigger any on-chain payout. Before a real payout can ever be wired to this
    // path, the caller MUST submit and the server MUST verify a ZK nullifier + denomination
    // proof binding the nullifier to a specific committed deposit leaf in this pool. Until
    // that circuit is verified here, the guards below are the minimum safety net:
    //   (a) reject blank inputs,
    //   (b) require the pool to contain at least one recorded deposit (no withdraws from an
    //       empty pool — a partial bind to a real prior deposit; a full per-note bind needs
    //       the ZK membership proof above),
    //   (c) record the nullifier ATOMICALLY and reject any reuse (double-spend).
    let nullifier = input.nullifier.trim();
    let covenant_id = input.covenant_id.trim();
    if nullifier.is_empty() || covenant_id.is_empty() {
        return Json(MixerWithdrawOutput {
            success: false,
            error: Some("covenant_id and nullifier are required".to_string()),
        });
    }

    // (b) Bind to evidence of a real prior deposit: the pool must have recorded leaves.
    // A pool with zero deposits can never have produced a valid note, so reject outright.
    let (_root, leaf_count) =
        crate::db::mixer_get_root(&db, covenant_id).unwrap_or(("0".to_string(), 0));
    if leaf_count <= 0 {
        return Json(MixerWithdrawOutput {
            success: false,
            error: Some("no deposits exist for this pool".to_string()),
        });
    }

    // (a)+(c) Atomic spend: INSERT OR IGNORE returns 0 rows if the nullifier already exists.
    match crate::db::mixer_record_nullifier(&db, nullifier, covenant_id) {
        Ok(0) => Json(MixerWithdrawOutput {
            success: false,
            error: Some("nullifier already spent".to_string()),
        }),
        Ok(_) => Json(MixerWithdrawOutput { success: true, error: None }),
        Err(e) => Json(MixerWithdrawOutput { success: false, error: Some(e.to_string()) }),
    }
}

async fn pools_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
) -> Json<serde_json::Value> {
    // Basic pools view (count of roots + note). Real per-covenant pools via /root/:id + deposit.
    let conn = db.lock().unwrap();
    let pools: i64 = conn.query_row("SELECT COUNT(*) FROM mixer_roots", [], |r| r.get(0)).unwrap_or(0);
    Json(serde_json::json!({
        "pools": pools,
        "note": "Use /mixer/status and /mixer/root/:covenant_id for details. Deposit records leaves and updates merkle root."
    }))
}

async fn deposits_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
    // Return leaf count + sample for the covenant (lightweight, no full list for large pools).
    let conn = db.lock().unwrap();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM mixer_leaves WHERE covenant_id = ?1",
        rusqlite::params![covenant_id],
        |r| r.get(0),
    ).unwrap_or(0);
    Json(serde_json::json!({
        "covenant_id": covenant_id,
        "leaf_count": count,
        "note": "Full leaf data via internal; for covenant use the merkle root from /root/ + ZK membership proof."
    }))
}

async fn nullifiers_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
    let conn = db.lock().unwrap();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM mixer_nullifiers WHERE covenant_id = ?1",
        rusqlite::params![covenant_id],
        |r| r.get(0),
    ).unwrap_or(0);
    Json(serde_json::json!({
        "covenant_id": covenant_id,
        "nullifier_count": count,
        "note": "Nullifiers recorded on withdraw for double-spend prevention in hybrid mixer covenants."
    }))
}