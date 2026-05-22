use axum::{routing::get, Router, Json, Extension};
use serde_json::json;
use std::net::SocketAddr;
use std::env;
use std::sync::Arc;
use std::sync::Mutex;
use tracing_subscriber::{fmt, EnvFilter};
use tracing::{info, warn, error};

mod covenant_types;
mod db;
mod indexer;
mod payment_verifier;
mod ui_generator;

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
    tokio::spawn(async move {
        indexer::run_indexer(idx_client, idx_db, idx_seeds).await;
    });

    // --- Background: Payment Verifier ---
    let pay_db = Arc::clone(&db);
    let pay_client = Arc::clone(&client);
    let pay_treasury = treasury.clone();
    tokio::spawn(async move {
        payment_verifier::run_payment_verifier(pay_client, pay_db, pay_treasury).await;
    });

    // --- Routes ---
    let app = tower_http::cors::CorsLayer::permissive();
    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(|| async { "OK" }))
        .route("/api/covenants", get(covenants_handler))
        .route("/api/status", get(status_handler))
        .route("/api/tiers", get(tiers_handler))
        .layer(Extension(db.clone()))
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

async fn covenants_handler(Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>) -> Json<serde_json::Value> {
    match db::get_all_covenants(&db) {
        Ok(records) => {
            let total = records.len();
            let list: Vec<serde_json::Value> = records.into_iter().map(|c| {
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
                    "is_active": c.is_active,
                    "block_daa_score": c.block_daa_score,
                    "timestamp": c.timestamp,
                    "name": c.covenant_type,
                    "tier": c.verified_tier,
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

/// Compute a blake2b-based script hash from hex (matching TN10 conventions)
pub fn compute_script_hash(script_hex: &str) -> String {
    use sha2::{Sha256, Digest};
    let bytes = hex::decode(script_hex).unwrap_or_default();
    let hash = Sha256::digest(&bytes);
    hex::encode(&hash[..20])
}
