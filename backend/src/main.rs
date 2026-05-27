use axum::{routing::get, Router, Json, Extension, extract::{Path, Query}};
use serde_json::json;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::env;
use std::sync::Arc;
use std::sync::Mutex;
use tracing_subscriber::{fmt, EnvFilter};
use tracing::{info, warn, error};

mod covenant_types;
mod crawler;
mod db;
mod indexer;
mod payment_verifier;
mod ui_generator;
mod signer;
mod broadcast;
mod dev_wallets;

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
    let wrpc_url = env::var("KASPA_WRPC_URL").unwrap_or_else(|_| "ws://127.0.0.1:17110".to_string());
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

    info!("Covex backend -- network: {}  wRPC: {}  bind: {}", env::var("KASPA_NETWORK").unwrap_or_else(|_| "testnet-10".to_string()), wrpc_url, addr);
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
    let api_routes = signer::signer_routes()
        .merge(broadcast::broadcast_routes());

    let app = tower_http::cors::CorsLayer::permissive();
    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(|| async { "OK" }))
        .route("/covenants", get(covenants_handler))
        .route("/status", get(status_handler))
        .route("/tiers", get(tiers_handler))
        .route("/terminal-config/:covenant_id", get(get_terminal_config_handler).post(save_terminal_config_handler))
        .layer(Extension(db.clone()))
        .merge(api_routes)
        .layer(app);

    info!("Serving on {}", addr);
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}

// ─── Handlers ────────────────────────────────────────────────

async fn root_handler() -> Json<serde_json::Value> {
    Json(json!({"status": "ok", "app": "Covex v1.0.0", "network": "testnet-10"}))
}

async fn status_handler(Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>) -> Json<serde_json::Value> {
    let total = db::count_covenants(&db).unwrap_or(0);
    let active = db::count_active_covenants(&db).unwrap_or(0);
    let verified = db::count_verified_covenants(&db).unwrap_or(0);
    Json(json!({
        "status": "ok",
        "network": "testnet-10",
        "node_connected": true,
        "total_covenants": total,
        "active_covenants": active,
        "verified_covenants": verified,
        "message": "Indexer active"
    }))
}

async fn covenants_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let records = if let Some(creator_addr) = params.get("creator").filter(|s| !s.is_empty()) {
        match db::get_covenants_by_creator(&db, creator_addr) {
            Ok(recs) => recs,
            Err(e) => {
                error!("Failed to query covenants by creator '{}': {}", creator_addr, e);
                return Json(json!({"total": 0, "covenants": [], "error": e.to_string()}));
            }
        }
    } else {
        match db::get_all_covenants(&db) {
            Ok(recs) => recs,
            Err(e) => {
                error!("Failed to query all covenants: {}", e);
                return Json(json!({"total": 0, "covenants": [], "error": e.to_string()}));
            }
        }
    };

    let total = records.len();
    let uis_map = db::get_all_generated_uis_map(&db).unwrap_or_default();
    let list: Vec<serde_json::Value> = records.into_iter().map(|c| {
        let tx_id = c.tx_id.clone();
        let custom_ui_html = uis_map.get(&tx_id).map(|(html, _)| html.clone()).unwrap_or_default();
        let custom_ui_config = uis_map.get(&tx_id).and_then(|(_, cfg)| serde_json::from_str::<serde_json::Value>(cfg).ok());
        let ui_config_display = custom_ui_config.unwrap_or_else(|| db::ui_config_for_tier(&c.verified_tier));
        json!({
            "tx_id": tx_id,
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
            "is_active": c.is_active,
            "block_daa_score": c.block_daa_score,
            "timestamp": c.timestamp,
            "name": c.covenant_type,
            "tier": c.verified_tier,
            "custom_ui_html": custom_ui_html,
            "custom_ui_config": ui_config_display,
        })
    }).collect();
    Json(json!({"total": total, "covenants": list}))
}

async fn tiers_handler() -> Json<serde_json::Value> {
    let tiers = covenant_types::get_tiers();
    Json(json!({"tiers": tiers}))
}

// ─── Terminal Config Handlers ────────────────────────────────────

use serde::Deserialize;

#[derive(Deserialize)]
struct TerminalConfigInput {
    name: Option<String>,
    description: Option<String>,
    fee_percent: Option<f64>,
    reusable: Option<bool>,
    allow_topups: Option<bool>,
    custom_ui_code: Option<String>,
    resolution_mode: Option<String>,
    custom_oracle_key: Option<String>,
    zk_circuit: Option<String>,
    zk_verifier_key: Option<String>,
}

async fn get_terminal_config_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    match db::get_generated_ui_by_covenant(&db, &covenant_id) {
        Ok(Some(ui)) => {
            // Parse ui_config which stores our terminal configuration
            let config_str = ui.get("ui_config").and_then(|v| v.as_str()).unwrap_or("{}");
            let config: serde_json::Value = serde_json::from_str(config_str).unwrap_or(json!({}));
            Json(json!({
                "success": true,
                "config": config,
                "ui_html": ui.get("ui_html").and_then(|v| v.as_str()).unwrap_or(""),
            }))
        }
        Ok(None) => Json(json!({"success": true, "config": {}, "ui_html": ""})),
        Err(e) => Json(json!({"success": false, "error": e.to_string()})),
    }
}

async fn save_terminal_config_handler(
    Path(covenant_id): Path<String>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(input): Json<TerminalConfigInput>,
) -> Json<serde_json::Value> {
    // Build the config JSON from input
    let config = json!({
        "name": input.name,
        "description": input.description,
        "fee_percent": input.fee_percent.unwrap_or(2.0),
        "reusable": input.reusable.unwrap_or(true),
        "allow_topups": input.allow_topups.unwrap_or(false),
        "resolution_mode": input.resolution_mode.unwrap_or_else(|| "oracle".to_string()),
        "custom_oracle_key": input.custom_oracle_key,
        "zk_circuit": input.zk_circuit,
        "zk_verifier_key": input.zk_verifier_key,
        "updated_at": chrono::Utc::now().timestamp(),
    });
    let ui_html = input.custom_ui_code.unwrap_or_default();
    let slug = format!("covenant-{}", &covenant_id[..12.min(covenant_id.len())]);

    // Use "system" as owner since terminal saves are per-covenant, not per-user
    match db::save_generated_ui(
        &db,
        &covenant_id,
        "system",
        "TERMINAL",
        &ui_html,
        &config.to_string(),
        &slug,
        false,
    ) {
        Ok(_) => {
            info!("Terminal config saved for covenant {}", covenant_id);
            Json(json!({"success": true, "message": "Configuration saved successfully"}))
        }
        Err(e) => {
            error!("Failed to save terminal config: {}", e);
            Json(json!({"success": false, "error": e.to_string()}))
        }
    }
}

/// Compute a blake2b-based script hash from hex (matching TN10 conventions)
pub fn compute_script_hash(script_hex: &str) -> String {
    use sha2::{Sha256, Digest};
    let bytes = hex::decode(script_hex).unwrap_or_default();
    let hash = Sha256::digest(&bytes);
    hex::encode(&hash[..20])
}
