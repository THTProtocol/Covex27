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
}

pub fn mixer_routes() -> Router {
    Router::new()
        .route("/mixer/deposit", post(deposit_handler))
        .route("/mixer/root/:covenant_id", get(root_handler))
        .route("/mixer/status", get(status_handler))
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
    })
}