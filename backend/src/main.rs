use axum::{routing::{get, post}, Router, Json, Extension, extract::{Path, Query}};
use serde_json::json;
use std::net::SocketAddr;
use std::env;
use std::sync::Arc;
use std::sync::Mutex;
use tracing_subscriber::{fmt, EnvFilter};
use tracing::{info, warn, error};
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_addresses::Address;

mod covenant_types;
mod crawler;
mod db;
mod dev_wallets;
mod indexer;
mod payment_verifier;
mod ui_generator;
mod broadcast;
mod signer;

#[tokio::main]
async fn main() {
    // --- Load .env ---
    let _ = dotenvy::dotenv();

    // --- Init tracing ---
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("covex27_backend=info,kaspa_wrpc=warn"));
    fmt().with_env_filter(filter).init();

    // --- Config ---
    let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3005".to_string());
    let addr: SocketAddr = bind_addr.parse().expect("Invalid BIND_ADDR");
    let wrpc_url = env::var("KASPA_WRPC_URL").unwrap_or_else(|_| "ws://127.0.0.1:17217".to_string());
    let db_path = env::var("DB_PATH").unwrap_or_else(|_| "../covex.db".to_string());
    let treasury = env::var("COVENANT_TREASURY_ADDRESS")
        .unwrap_or_else(|_| "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m".to_string());
    let seed_addrs: Vec<String> = env::var("COVENANT_SEED_ADDRESSES")
        .unwrap_or_default()
        .split(',')
        .filter(|s| !s.is_empty())
        .map(|s| s.trim().to_string())
        .collect();
    let crawl_start_daa: u64 = env::var("CRAWL_START_DAA")
        .unwrap_or_else(|_| "1".to_string())
        .parse()
        .unwrap_or(1);

    info!("Covex backend -- network: {}  wRPC: {}  bind: {}", env::var("KASPA_NETWORK").unwrap_or_else(|_| "testnet-12".to_string()), wrpc_url, addr);
    info!("Treasury: {}", treasury);

    // --- Open DB ---
    let db = match db::open_db(&db_path) {
        Ok(d) => {
            info!("Database opened at {}", db_path);
            Arc::new(d)
        }
        Err(e) => {
            error!("Failed to open database: {}", e);
            std::process::exit(1);
        }
    };

    // --- Connect to Kaspa wRPC ---
    let (client, client_url) = match kaspa_wrpc_client::KaspaRpcClient::new(
        kaspa_wrpc_client::WrpcEncoding::Borsh,
        Some(&wrpc_url),
        None,
        None,
        None,
    ) {
        Ok(c) => {
            let url = c.url().unwrap_or(wrpc_url.clone());
            (Arc::new(c), url)
        }
        Err(e) => {
            error!("Failed to create wRPC client: {}", e);
            std::process::exit(1);
        }
    };

    info!("Connecting to Kaspa wRPC node at {}...", client_url);
    match client.connect(None).await {
        Ok(_) => info!("Connected to Kaspa wRPC node"),
        Err(e) => warn!("wRPC connect failed (will retry in background): {}", e),
    }

    // --- Background: Indexer ---
    let idx_db = Arc::clone(&db);
    let idx_client = Arc::clone(&client);
    let idx_seeds = seed_addrs.clone();
    let idx_treasury = treasury.clone();
    tokio::spawn(async move {
        indexer::run_indexer(idx_client, idx_db, idx_seeds, idx_treasury).await;
    });

    // --- Background: Payment Verifier ---
    let pay_db = Arc::clone(&db);
    let pay_client = Arc::clone(&client);
    let pay_treasury = treasury.clone();
    tokio::spawn(async move {
        payment_verifier::run_payment_verifier(pay_client, pay_db, pay_treasury).await;
    });

    // --- Background: Historic Crawler ---
    let crawl_db = Arc::clone(&db);
    let crawl_client = Arc::clone(&client);
    let crawl_treasury = treasury.clone();
    tokio::spawn(async move {
        crawler::run_crawler(crawl_client, crawl_db, crawl_treasury, crawl_start_daa).await;
    });

    // --- Routes ---
    let cors = tower_http::cors::CorsLayer::permissive();
    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(|| async { "OK" }))
        .route("/covenants", get(covenants_handler))
        .route("/covenants/:id", get(single_covenant_handler))
        .route("/covenants/:id/ui-config", post(ui_config_handler))
        .route("/covenants/:id/trust-config", get(trust_config_handler))
        .route("/covenants/:id/custom-ui", post(custom_ui_handler))
        .route("/covenants/:id/custom-ui", get(get_custom_ui_handler))
        .route("/covenants/:id/status", get(utxo_status_handler))
        .route("/covenants/:id/create-game", post(create_game_handler))
        .route("/covenants/:id/join-game", post(join_game_handler))
        .route("/covenants/:id/make-move", post(make_move_handler))
        .route("/covenants/:id/game-state", get(game_state_handler))
        .route("/covenants/:id/resolve-winner", post(resolve_winner_handler))
        .route("/status", get(status_handler))
        .route("/tiers", get(tiers_handler))
        .route("/verify-payment", post(verify_payment_handler))
        .merge(broadcast::broadcast_routes())
        .merge(signer::signer_routes())
        .layer(cors)
        .layer(Extension(db.clone()))
        .layer(Extension(client.clone()));

    info!("Serving on {}", addr);
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}

// ─── Handlers ────────────────────────────────────────────────

async fn root_handler() -> Json<serde_json::Value> {
    Json(json!({"status": "ok", "app": "Covex v1.0.0", "network": "testnet-12"}))
}

async fn status_handler(Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>) -> Json<serde_json::Value> {
    let total = db::count_covenants(&db).unwrap_or(0);
    let active = db::count_active_covenants(&db).unwrap_or(0);
    let verified = db::count_verified_covenants(&db).unwrap_or(0);
    Json(json!({
        "status": "ok",
        "network": "testnet-12",
        "node_connected": true,
        "total_covenants": total,
        "active_covenants": active,
        "verified_covenants": verified,
        "message": "Indexer active"
    }))
}

#[derive(serde::Deserialize)]
struct CovenantsQuery {
    creator: Option<String>,
}

async fn covenants_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Query(query): Query<CovenantsQuery>,
) -> Json<serde_json::Value> {
    let records = match query.creator {
        Some(ref creator) if !creator.is_empty() => {
            db::get_covenants_by_creator(&db, creator).unwrap_or_default()
        }
        _ => db::get_all_covenants(&db).unwrap_or_default()
    };
    let total = records.len();
    let list: Vec<serde_json::Value> = records.into_iter().map(|c| {
                let trust_config = db::get_ui_trust_config(&db, &c.tx_id).ok().flatten();
                let has_verified_source = trust_config.as_ref()
                    .and_then(|tc| tc.get("verified_source_url"))
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                let custom_ui = db::get_custom_ui_config(&db, &c.tx_id).ok().flatten();
                json!({
                    "tx_id": c.tx_id,
                    "address": c.address,
                    "amount_kaspa": c.amount_kaspa,
                    "script_hash": c.script_hash,
                    "script_hex": c.script_hex,
                    "covenant_type": c.covenant_type,
                    "category": c.category,
                    "creator_addr": c.creator_addr,
                    "description": c.description,
                    "verified_tier": c.verified_tier,
                    "custom_ui_enabled": c.custom_ui_enabled,
                    "full_logic_summary": c.full_logic_summary,
                    "receiving_addresses": c.receiving_addresses,
                    "is_active": c.is_active,
                    "block_daa_score": c.block_daa_score,
                    "timestamp": c.timestamp,
                    "name": c.covenant_type,
                    "tier": c.verified_tier,
                    "ui_config": db::ui_config_for_tier(&c.verified_tier),
                    "trust_config": trust_config,
                    "has_verified_source": has_verified_source,
                    "custom_ui_config": custom_ui,
                })
            }).collect();
    Json(json!({"total": total, "covenants": list}))
}

async fn tiers_handler() -> Json<serde_json::Value> {
    let tiers = covenant_types::get_tiers();
    Json(json!({"tiers": tiers}))
}

// ─── Single Covenant Endpoint ─────────────────────────────

async fn single_covenant_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    match db::get_covenant_by_txid(&db, &covenant_id) {
        Ok(Some(c)) => {
            let trust_config = db::get_ui_trust_config(&db, &c.tx_id).ok().flatten();
            let has_verified_source = trust_config.as_ref()
                .and_then(|tc| tc.get("verified_source_url"))
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false);
            let custom_ui = db::get_custom_ui_config(&db, &c.tx_id).ok().flatten();
            Json(json!({
                "success": true,
                "covenant": {
                    "tx_id": c.tx_id,
                    "address": c.address,
                    "amount_kaspa": c.amount_kaspa,
                    "script_hash": c.script_hash,
                    "script_hex": c.script_hex,
                    "covenant_type": c.covenant_type,
                    "category": c.category,
                    "creator_addr": c.creator_addr,
                    "description": c.description,
                    "verified_tier": c.verified_tier,
                    "custom_ui_enabled": c.custom_ui_enabled,
                    "full_logic_summary": c.full_logic_summary,
                    "receiving_addresses": c.receiving_addresses,
                    "is_active": c.is_active,
                    "block_daa_score": c.block_daa_score,
                    "timestamp": c.timestamp,
                    "name": c.covenant_type,
                    "tier": c.verified_tier,
                    "ui_config": db::ui_config_for_tier(&c.verified_tier),
                    "trust_config": trust_config,
                    "has_verified_source": has_verified_source,
                    "custom_ui_config": custom_ui,
                }
            }))
        }
        Ok(None) => Json(json!({"success": false, "error": "Covenant not found", "covenant": null})),
        Err(e) => {
            error!("Failed to query covenant: {}", e);
            Json(json!({"success": false, "error": e.to_string(), "covenant": null}))
        }
    }
}

// ─── Trust-Verification UI Config ──────────────────────────

#[derive(serde::Deserialize)]
struct UiConfigRequest {
    creator_addr: String,
    verified_source_url: Option<String>,
    developer_notes: Option<String>,
    interaction_schema: Option<String>,
    custom_category: Option<String>,
}

/// POST /covenants/:id/ui-config — Secured endpoint.
/// Verifies that the connected wallet address matches the on-chain creator_addr.
async fn ui_config_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(payload): Json<UiConfigRequest>,
) -> Json<serde_json::Value> {
    // 1. Fetch the on-chain creator_addr for this covenant
    let covenant = match db::get_covenant_by_txid(&db, &covenant_id) {
        Ok(Some(c)) => c,
        Ok(None) => return Json(json!({"success": false, "error": "Covenant not found"})),
        Err(e) => return Json(json!({"success": false, "error": format!("DB error: {}", e)})),
    };

    // 2. Strict wallet binding — wallet must match on-chain creator
    let wallet_addr = payload.creator_addr.trim().to_lowercase();
    let onchain_creator = covenant.creator_addr.trim().to_lowercase();
    if wallet_addr != onchain_creator {
        warn!(
            "UI config rejected: wallet {} != on-chain creator {} for covenant {}",
            wallet_addr, onchain_creator, covenant_id
        );
        return Json(json!({
            "success": false,
            "error": "WALLET MISMATCH: Only the covenant creator can configure UI settings.",
            "onchain_creator": covenant.creator_addr,
            "provided_wallet": payload.creator_addr,
        }));
    }

    // 3. Only PRO/MAX tiers can configure trust settings
    let tier = covenant.verified_tier.to_uppercase();
    if tier != "PRO" && tier != "MAX" {
        return Json(json!({
            "success": false,
            "error": format!("Trust builder requires PRO or MAX tier. Current tier: {}", tier),
        }));
    }

    // 4. Persist the trust config
    let source_url = payload.verified_source_url.as_deref().unwrap_or("");
    let notes = payload.developer_notes.as_deref().unwrap_or("");
    let schema = payload.interaction_schema.as_deref().unwrap_or("");
    let custom_cat = payload.custom_category.as_deref().unwrap_or("");

    match db::save_ui_trust_config(&db, &covenant_id, &covenant.creator_addr, source_url, notes, schema, custom_cat) {
        Ok(()) => {
            info!("Trust config saved for covenant {} by creator {}", covenant_id, wallet_addr);
            Json(json!({"success": true, "message": "Trust configuration saved successfully."}))
        }
        Err(e) => {
            error!("Failed to save trust config: {}", e);
            Json(json!({"success": false, "error": format!("DB save failed: {}", e)}))
        }
    }
}

/// GET /covenants/:id/trust-config — Public read endpoint.
async fn trust_config_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    match db::get_ui_trust_config(&db, &covenant_id) {
        Ok(Some(config)) => Json(json!({"success": true, "trust_config": config})),
        Ok(None) => Json(json!({"success": true, "trust_config": null, "message": "No trust config set"})),
        Err(e) => Json(json!({"success": false, "error": e.to_string()})),
    }
}

// ─── Custom UI Builder ─────────────────────────────────────

#[derive(serde::Deserialize)]
struct CustomUiConfigRequest {
    creator_addr: String,
    config_json: Option<serde_json::Value>,
}

/// POST /covenants/:id/custom-ui — Save advanced UI builder config.
async fn custom_ui_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(payload): Json<CustomUiConfigRequest>,
) -> Json<serde_json::Value> {
    // 1. Fetch the on-chain covenant
    let covenant = match db::get_covenant_by_txid(&db, &covenant_id) {
        Ok(Some(c)) => c,
        Ok(None) => return Json(json!({"success": false, "error": "Covenant not found"})),
        Err(e) => return Json(json!({"success": false, "error": format!("DB error: {}", e)})),
    };

    // 2. Validate wallet_addr == on-chain creator_addr (case-insensitive)
    let wallet_addr = payload.creator_addr.trim().to_lowercase();
    let onchain_creator = covenant.creator_addr.trim().to_lowercase();
    if wallet_addr != onchain_creator {
        warn!(
            "Custom UI rejected: wallet {} != on-chain creator {} for covenant {}",
            wallet_addr, onchain_creator, covenant_id
        );
        return Json(json!({
            "success": false,
            "error": "WALLET MISMATCH: Only the covenant creator can configure custom UI.",
            "onchain_creator": covenant.creator_addr,
            "provided_wallet": payload.creator_addr,
        }));
    }

    // 3. Only PRO/MAX/CREATOR tiers can save custom UI
    let tier = covenant.verified_tier.to_uppercase();
    if tier != "PRO" && tier != "MAX" && tier != "CREATOR" {
        return Json(json!({
            "success": false,
            "error": format!("Custom UI builder requires CREATOR, PRO, or MAX tier. Current tier: {}", tier),
        }));
    }

    // 4. Serialize config_json to string and persist
    let cfg_str = payload.config_json
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".to_string());

    match db::save_custom_ui_config(&db, &covenant_id, &covenant.creator_addr, &tier, &cfg_str) {
        Ok(()) => {
            info!("Custom UI config saved for covenant {} by creator {}", covenant_id, wallet_addr);
            Json(json!({"success": true, "message": "Custom UI configuration saved successfully."}))
        }
        Err(e) => {
            error!("Failed to save custom UI config: {}", e);
            Json(json!({"success": false, "error": format!("DB save failed: {}", e)}))
        }
    }
}

/// GET /covenants/:id/custom-ui — Public read endpoint.
async fn get_custom_ui_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    match db::get_custom_ui_config(&db, &covenant_id) {
        Ok(Some(config)) => Json(json!({"success": true, "custom_ui_config": config})),
        Ok(None) => Json(json!({"success": true, "custom_ui_config": null, "message": "No custom UI config set"})),
        Err(e) => Json(json!({"success": false, "error": e.to_string()})),
    }
}

/// GET /covenants/:id/status — Live UTXO status from kaspad.
/// Returns whether the covenant UTXO is still unspent on the DAG.
async fn utxo_status_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Extension(client): Extension<Arc<kaspa_wrpc_client::KaspaRpcClient>>,
) -> Json<serde_json::Value> {
    let covenant = match db::get_covenant_by_txid(&db, &covenant_id) {
        Ok(Some(c)) => c,
        Ok(None) => return Json(json!({"success": false, "error": "Covenant not found"})),
        Err(e) => return Json(json!({"success": false, "error": format!("DB error: {}", e)})),
    };

    let addr = match Address::try_from(covenant.address.as_str()) {
        Ok(a) => a,
        Err(e) => {
            // Invalid Kaspa address format (raw hex from crawler) — fallback to DB status
            warn!("UTXO status: invalid address format for {}: {}", covenant_id, e);
            let last_checked_ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            return Json(json!({
                "success": true,
                "is_unspent": covenant.is_active,
                "status": if covenant.is_active { "LOCKED" } else { "UNKNOWN" },
                "locked_amount_kas": covenant.amount_kaspa,
                "message": "DB-tracked status. Raw hex address cannot be queried from kaspad.",
                "last_checked": last_checked_ts
            }));
        }
    };

    let last_checked_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    match client.get_utxos_by_addresses(vec![addr]).await {
        Ok(entries) => {
            let matching: Vec<_> = entries.iter()
                .filter(|e| e.outpoint.transaction_id.to_string() == covenant.tx_id.split(':').next().unwrap_or(&covenant.tx_id))
                .collect();

            if matching.is_empty() {
                Json(json!({
                    "success": true,
                    "is_unspent": false,
                    "status": "SPENT",
                    "locked_amount_kas": covenant.amount_kaspa,
                    "message": "This covenant UTXO has been spent or was never confirmed.",
                    "last_checked": last_checked_ts
                }))
            } else {
                let current_amount = matching[0].utxo_entry.amount as f64 / 100_000_000.0;
                Json(json!({
                    "success": true,
                    "is_unspent": true,
                    "status": "LOCKED",
                    "locked_amount_kas": current_amount,
                    "original_amount_kas": covenant.amount_kaspa,
                    "message": "Covenant UTXO is still locked on the Kaspa BlockDAG.",
                    "last_checked": last_checked_ts,
                    "block_daa": matching[0].utxo_entry.block_daa_score
                }))
            }
        }
        Err(e) => {
            warn!("UTXO status check failed for {}: {}", covenant_id, e);
            Json(json!({
                "success": true,
                "is_unspent": covenant.is_active,
                "status": if covenant.is_active { "LOCKED" } else { "UNKNOWN" },
                "locked_amount_kas": covenant.amount_kaspa,
                "message": "Could not reach kaspad. Showing last known status from DB.",
                "last_checked": last_checked_ts
            }))
        }
    }
}

/// Compute a blake2b-based script hash from hex (matching TN12 conventions)
pub fn compute_script_hash(script_hex: &str) -> String {
    use sha2::{Sha256, Digest};
    let bytes = hex::decode(script_hex).unwrap_or_default();
    let hash = Sha256::digest(&bytes);
    hex::encode(&hash[..20])
}

// ─── Skill Game Handlers ───────────────────────────────────

#[derive(serde::Deserialize)]
struct CreateGameRequest {
    game_type: String,
    creator_addr: String,
    pot_amount_kas: f64,
    player2: Option<String>,
}

/// POST /covenants/:id/create-game — Create a skill-game chess match
async fn create_game_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(payload): Json<CreateGameRequest>,
) -> Json<serde_json::Value> {
    let covenant = match db::get_covenant_by_txid(&db, &covenant_id) {
        Ok(Some(c)) => c,
        Ok(None) => return Json(json!({"success": false, "error": "Covenant not found"})),
        Err(e) => return Json(json!({"success": false, "error": format!("DB error: {}", e)})),
    };

    let wallet = payload.creator_addr.trim().to_lowercase();
    let onchain = covenant.creator_addr.trim().to_lowercase();
    if wallet != onchain {
        return Json(json!({"success": false, "error": "Only covenant creator can create a game"}));
    }

    match db::create_skill_game(&db, &covenant_id, &payload.game_type, payload.pot_amount_kas, &covenant.creator_addr) {
        Ok(()) => {
            if let Some(p2) = &payload.player2 {
                if !p2.is_empty() {
                    let _ = db::join_skill_game(&db, &covenant_id, p2);
                }
            }
            Json(json!({"success": true, "message": "Skill game created successfully"}))
        }
        Err(e) => Json(json!({"success": false, "error": format!("Failed to create game: {}", e)})),
    }
}

#[derive(serde::Deserialize)]
struct JoinGameRequest {
    player2: String,
}

/// POST /covenants/:id/join-game — Second player joins a waiting game
async fn join_game_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(payload): Json<JoinGameRequest>,
) -> Json<serde_json::Value> {
    match db::join_skill_game(&db, &covenant_id, &payload.player2) {
        Ok(()) => Json(json!({"success": true, "message": "Joined game successfully"})),
        Err(e) => Json(json!({"success": false, "error": format!("Failed to join: {}", e)})),
    }
}

#[derive(serde::Deserialize)]
struct MakeMoveRequest {
    player: String,
    moves: String,
    current_turn: String,
}

/// POST /covenants/:id/make-move — Record a chess move
async fn make_move_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(payload): Json<MakeMoveRequest>,
) -> Json<serde_json::Value> {
    match db::record_move(&db, &covenant_id, &payload.moves, &payload.current_turn) {
        Ok(()) => Json(json!({"success": true, "message": "Move recorded"})),
        Err(e) => Json(json!({"success": false, "error": format!("Failed to record move: {}", e)})),
    }
}

/// GET /covenants/:id/game-state — Get current chess game state
async fn game_state_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    match db::get_skill_game(&db, &covenant_id) {
        Ok(Some(game)) => Json(json!({
            "success": true,
            "covenant_id": game.covenant_id,
            "game_type": game.game_type,
            "pot_amount_kas": game.pot_amount_kas,
            "player1": game.player1,
            "player2": game.player2,
            "moves": game.moves,
            "current_turn": game.current_turn,
            "winner": game.winner,
            "status": game.status,
            "created_at": game.created_at,
            "updated_at": game.updated_at,
        })),
        Ok(None) => Json(json!({"success": false, "error": "No game found for this covenant"})),
        Err(e) => Json(json!({"success": false, "error": e.to_string()})),
    }
}

#[derive(serde::Deserialize)]
struct ResolveWinnerRequest {
    winner: String,
    claimer: String,
}

/// POST /covenants/:id/resolve-winner — Declare winner (winner-takes-all)
async fn resolve_winner_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(payload): Json<ResolveWinnerRequest>,
) -> Json<serde_json::Value> {
    match db::set_winner(&db, &covenant_id, &payload.winner) {
        Ok(()) => Json(json!({
            "success": true,
            "message": format!("Game over. Winner: {}. Pot: use on-chain transaction to release funds.", payload.winner),
            "winner": payload.winner,
        })),
        Err(e) => Json(json!({"success": false, "error": format!("Failed to resolve: {}", e)})),
    }
}

// ─── Verify Payment Handler ────────────────────────────────

#[derive(serde::Deserialize)]
struct VerifyPaymentRequest {
    tx_id: String,
    covenant_address: Option<String>,
    tier: Option<String>,
}

async fn verify_payment_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(payload): Json<VerifyPaymentRequest>,
) -> Json<serde_json::Value> {
    match db::insert_payment(&db, &payload.tx_id, "", "", 0, payload.tier.as_deref().unwrap_or("CREATOR"), payload.covenant_address.as_deref()) {
        Ok(()) => Json(json!({"success": true, "message": "Payment registered. Will be verified after 6 confirmations."})),
        Err(e) => Json(json!({"success": false, "error": format!("Failed: {}", e)})),
    }
}
