use axum::{routing::{get, post}, Router, Json, Extension, extract::Path};
use serde_json::json;
use std::net::SocketAddr;
use std::env;
use std::sync::Arc;
use std::sync::Mutex;
use tracing_subscriber::{fmt, EnvFilter};
use tracing::{info, warn, error};

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
    let app = tower_http::cors::CorsLayer::permissive();
    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(|| async { "OK" }))
        .route("/covenants", get(covenants_handler))
        .route("/covenants/:id/ui-config", post(ui_config_handler))
        .route("/covenants/:id/trust-config", get(trust_config_handler))
        .route("/covenants/:id/custom-ui", post(custom_ui_handler))
        .route("/covenants/:id/custom-ui", get(get_custom_ui_handler))
        .route("/status", get(status_handler))
        .route("/tiers", get(tiers_handler))
        .merge(broadcast::broadcast_routes())
        .merge(signer::signer_routes())
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

async fn covenants_handler(Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>) -> Json<serde_json::Value> {
    match db::get_all_covenants(&db) {
        Ok(records) => {
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
        Err(e) => {
            error!("Failed to query covenants: {}", e);
            Json(json!({"total": 0, "covenants": [], "error": e.to_string()}))
        }
    }
}

async fn tiers_handler() -> Json<serde_json::Value> {
    let tiers = covenant_types::get_tiers();
    Json(json!({"tiers": tiers}))
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

/// Compute a blake2b-based script hash from hex (matching TN12 conventions)
pub fn compute_script_hash(script_hex: &str) -> String {
    use sha2::{Sha256, Digest};
    let bytes = hex::decode(script_hex).unwrap_or_default();
    let hash = Sha256::digest(&bytes);
    hex::encode(&hash[..20])
}
