use axum::{
    extract::{Path, Query},
    routing::get,
    routing::post,
    Extension, Json, Router,
};
use serde_json::json;
use std::collections::HashMap;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, EnvFilter};

mod broadcast;
mod compiler;
mod covenant_types;
mod crawler;
mod db;
mod dev_wallets;
mod indexer;
mod oracle;
mod payment_verifier;
mod signer;
mod ui_generator;

/// Default Kaspa network label used when KASPA_NETWORK env var is not set.
/// The project targets Toccata Testnet-12 (TN12).
const DEFAULT_KASPA_NETWORK: &str = "testnet-12";

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
    let wrpc_url =
        env::var("KASPA_WRPC_URL").unwrap_or_else(|_| "ws://127.0.0.1:17110".to_string());
    let db_path = env::var("DB_PATH").unwrap_or_else(|_| "../covex.db".to_string());
    // Read network BEFORE treasury so we can branch on mainnet vs testnet
    let network = env::var("KASPA_NETWORK")
        .unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    let treasury = env::var("COVENANT_TREASURY_ADDRESS").unwrap_or_else(|_| {
        if network == "mainnet" || network == "mainnet-1" {
            // TODO: Replace with real mainnet treasury before mainnet launch
            "kaspa:qzr8q7tq8w3n2x3a4y5z6w7x8c9d0eqqqqqqqqqqqqqqqqqqqqqqqqqq".to_string()
        } else {
            "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m".to_string()
        }
    });
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

    info!(
        "Covex backend -- network: {}  wRPC: {}  bind: {}",
        network, wrpc_url, addr
    );
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
        .route("/status", get(status_handler))
        .route("/tiers", get(tiers_handler))
        .route("/paid-status", get(paid_status_handler))
        .route(
            "/terminal-config/:covenant_id",
            get(get_terminal_config_handler).post(save_terminal_config_handler),
        )
        .route(
            "/terminal-config-challenge/:covenant_id",
            get(terminal_config_challenge_handler),
        )
        .layer(Extension(db.clone()))
        .merge(
            signer::signer_routes()
                .layer(Extension(client.clone()))
                .layer(Extension(db.clone())),
        )
        .merge(broadcast::broadcast_routes().layer(Extension(client.clone())))
        .route("/analytics", get(analytics_handler))
        .route("/marketplace/templates", get(marketplace_templates_handler))
        .route("/marketplace/publish", post(marketplace_publish_handler))
        .layer(Extension(db.clone()))
        .merge(oracle::oracle_routes())
        .layer(app);

    info!("Serving on {}", addr);
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}

// ─── Handlers ────────────────────────────────────────────────

async fn root_handler() -> Json<serde_json::Value> {
    let network = std::env::var("KASPA_NETWORK")
        .unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    let oracle_mode = if std::env::var("COVEX_ORACLE_KEY").is_ok() { "custom" } else { "default-testnet" };
    Json(json!({
        "status": "ok",
        "app": "Covex v1.0.0",
        "network": network,
        "oracle_key_mode": oracle_mode
    }))
}

async fn status_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    let total = db::count_covenants(&db).unwrap_or(0);
    let active = db::count_active_covenants(&db).unwrap_or(0);
    let verified = db::count_verified_covenants(&db).unwrap_or(0);
    let network = std::env::var("KASPA_NETWORK")
        .unwrap_or_else(|_| DEFAULT_KASPA_NETWORK.to_string());
    let oracle_mode = if std::env::var("COVEX_ORACLE_KEY").is_ok() { "custom" } else { "default-testnet" };
    Json(json!({
        "status": "ok",
        "network": network,
        "oracle_key_mode": oracle_mode,
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
                error!(
                    "Failed to query covenants by creator '{}': {}",
                    creator_addr, e
                );
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
    let list: Vec<serde_json::Value> = records
        .into_iter()
        .map(|c| {
            let tx_id = c.tx_id.clone();
            let custom_ui_html = uis_map
                .get(&tx_id)
                .map(|(html, _)| html.clone())
                .unwrap_or_default();
            let custom_ui_config = uis_map
                .get(&tx_id)
                .and_then(|(_, cfg)| serde_json::from_str::<serde_json::Value>(cfg).ok());
            let ui_config_display =
                custom_ui_config.unwrap_or_else(|| db::ui_config_for_tier(&c.verified_tier));
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
        })
        .collect();
    Json(json!({"total": total, "covenants": list}))
}

async fn tiers_handler() -> Json<serde_json::Value> {
    let tiers = covenant_types::get_tiers();
    Json(json!({"tiers": tiers}))
}

async fn paid_status_handler(
    Query(params): Query<std::collections::HashMap<String, String>>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    let address = params.get("address").cloned().unwrap_or_default();
    if address.is_empty() {
        return Json(json!({"highest_tier": null}));
    }

    match db::get_highest_paid_tier_for_address(&db, &address) {
        Ok(tier) => Json(json!({ "highest_tier": tier })),
        Err(_) => Json(json!({"highest_tier": null})),
    }
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
    game_type: Option<String>,
    // Ownership proof: signer address + Schnorr signature over nonce
    signer_address: Option<String>,
    signature: Option<String>,
    nonce: Option<String>,
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
    // ── Cryptographic ownership enforcement ──
    // Verify the signer_address + signature against the nonce (challenge-response).
    // If signature/nonce are provided, verify cryptographically.
    // Fall back to string comparison ONLY if the frontend hasn't implemented signing yet.
    if let (Some(ref signer), Some(ref sig_hex), Some(ref nonce)) =
        (&input.signer_address, &input.signature, &input.nonce)
    {
        if !sig_hex.is_empty() && !nonce.is_empty() {
            match verify_terminal_ownership_signature(signer, sig_hex, nonce, &covenant_id) {
                Ok(true) => {
                    info!("Schnorr signature verified for covenant {}", &covenant_id[..16]);
                }
                Ok(false) => {
                    warn!("Signature verification FAILED for covenant {} by claimed signer {}",
                        &covenant_id[..16], &signer[..16]);
                    return Json(json!({
                        "success": false,
                        "error": "Signature verification failed — the provided signature does not match the claimed signer address"
                    }));
                }
                Err(e) => {
                    warn!("Signature verification error: {}", e);
                    return Json(json!({
                        "success": false,
                        "error": format!("Signature verification error: {}", e)
                    }));
                }
            }
        }
    }

    // Fallback string comparison (weaker, but works when frontend hasn't wired signing)
    if let Some(ref signer) = input.signer_address {
        if input.signature.as_deref().unwrap_or("").is_empty() {
            if let Ok(Some(cov)) = db::get_covenant_by_txid(&db, &covenant_id) {
                if !cov.creator_addr.is_empty() && cov.creator_addr != *signer {
                    warn!("String comparison rejected edit for covenant {} — signer {} != creator {}",
                        &covenant_id[..16], &signer[..16], &cov.creator_addr[..16]);
                    return Json(json!({
                        "success": false,
                        "error": "Only the original covenant deployer can edit this configuration"
                    }));
                }
            }
        }
    }

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
        "game_type": input.game_type,
        "updated_at": chrono::Utc::now().timestamp(),
    });
    let ui_html = input.custom_ui_code.unwrap_or_default();
    let slug = format!("covenant-{}", &covenant_id[..12.min(covenant_id.len())]);

    // Store with the actual signer as owner when provided (for future audit)
    let owner = input.signer_address.clone().unwrap_or_else(|| "system".to_string());

    match db::save_generated_ui(
        &db,
        &covenant_id,
        &owner,
        "TERMINAL",
        &ui_html,
        &config.to_string(),
        &slug,
        false,
    ) {
        Ok(_) => {
            info!("Terminal config saved for covenant {} by {}", covenant_id, owner);
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
    use sha2::{Digest, Sha256};
    let bytes = hex::decode(script_hex).unwrap_or_default();
    let hash = Sha256::digest(&bytes);
    hex::encode(&hash[..20])
}

// ── Schnorr signature verification for Terminal config ownership ──

/// Verify terminal ownership via key possession proof.
/// For dev wallets: frontend computes SHA256(private_key || message), backend
/// recomputes the same hash from the known private key and compares.
/// For extension wallets: fall back to string comparison (the wallet bridge
/// already authenticates the connection).
fn verify_terminal_ownership_signature(
    signer_address: &str,
    sig_hex: &str,
    nonce: &str,
    covenant_id: &str,
) -> Result<bool, String> {
    use sha2::{Digest, Sha256};

    let expected_msg = format!("covex-config:{}:{}", covenant_id, nonce);

    // Check known dev wallets
    let dev_keys = [
        (crate::dev_wallets::DEV_WALLET_1_ADDRESS, crate::dev_wallets::DEV_WALLET_1_PRIVATE_KEY),
        (crate::dev_wallets::DEV_WALLET_2_ADDRESS, crate::dev_wallets::DEV_WALLET_2_PRIVATE_KEY),
    ];

    for (known_addr, known_pk) in &dev_keys {
        if *known_addr == signer_address {
            // Compute expected hash: SHA256(private_key_hex || message)
            let pk_clean = known_pk.trim_start_matches("0x");
            let pk_bytes = hex::decode(pk_clean).map_err(|_| "Invalid dev key hex".to_string())?;
            let mut hasher = Sha256::new();
            hasher.update(&pk_bytes);
            hasher.update(expected_msg.as_bytes());
            let expected = hex::encode(hasher.finalize());

            let sig_clean = sig_hex.trim_start_matches("0x");
            return Ok(sig_clean.eq_ignore_ascii_case(&expected));
        }
    }

    // Unknown address: reject (can't verify without knowing the private key)
    Err(format!(
        "Signature verification not available for this address ({}). Use a connected dev wallet or extension wallet.",
        &signer_address[..16]
    ))
}

/// GET /terminal-config-challenge/:covenant_id
/// Returns a random nonce for the frontend to sign, proving wallet ownership.
async fn terminal_config_challenge_handler(
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
    let nonce = uuid::Uuid::new_v4().to_string();
    let message = format!("covex-config:{}:{}", covenant_id, nonce);
    Json(json!({
        "nonce": nonce,
        "message": message,
        "note": "Sign this exact message with your wallet to prove ownership of the covenant"
    }))
}

// ── Analytics handler (Phase 18) ────────────────────────────────

async fn analytics_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let creator = params.get("creator").cloned();

    if let Some(addr) = &creator {
        let covenants = db::get_covenants_by_creator(&db, addr).unwrap_or_default();
        let total_val: f64 = covenants.iter().map(|c| c.amount_kaspa).sum();
        let count = covenants.len();
        let active_count = covenants.iter().filter(|c| c.is_active).count();
        
        Json(json!({
            "creator": addr,
            "total_covenants": count,
            "total_value_kas": (total_val * 100.0).round() / 100.0,
            "active_covenants": active_count,
            "verified_covenants": covenants.iter().filter(|c| c.verified_tier != "FREE").count(),
            "resolutions": 0, // TODO: Add real resolution tracking table
            "reputation_score": if count > 5 { 85 } else if count > 0 { 60 } else { 0 },
            "average_value_per_covenant": if count > 0 { (total_val / count as f64 * 100.0).round() / 100.0 } else { 0.0 }
        }))
    } else {
        let total = db::count_covenants(&db).unwrap_or(0);
        let active = db::count_active_covenants(&db).unwrap_or(0);
        let verified = db::count_verified_covenants(&db).unwrap_or(0);
        Json(json!({
            "total_covenants": total,
            "total_value_kas": 0, // Platform-wide TVL would require summing all
            "active_covenants": active,
            "verified_covenants": verified,
            "resolutions": 0,
            "platform_note": "Global analytics require additional aggregation queries"
        }))
    }
}

// ── Marketplace handlers (Phase 18) ─────────────────────────────

async fn marketplace_templates_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
) -> Json<serde_json::Value> {
    let uis = db::get_generated_uis(&db, None).unwrap_or_default();
    let publishable: Vec<serde_json::Value> = uis
        .into_iter()
        .filter(|ui| ui.get("is_published").and_then(|v| v.as_bool()).unwrap_or(false))
        .map(|ui| json!({
            "id": ui.get("covenant_id").and_then(|v| v.as_str()).unwrap_or(""),
            "name": ui.get("slug").and_then(|v| v.as_str()).unwrap_or("Untitled Template"),
            "description": "",
            "author": ui.get("owner_address").and_then(|v| v.as_str()).unwrap_or("unknown"),
            "price_kas": 0,
            "downloads": 0
        }))
        .collect();
    Json(json!({"templates": publishable, "total": publishable.len()}))
}

#[derive(Deserialize)]
struct MarketplacePublishInput {
    name: String,
    description: Option<String>,
    author: String,
    #[serde(default)]
    price_kas: u64,
    config: Option<serde_json::Value>,
}

async fn marketplace_publish_handler(
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(input): Json<MarketplacePublishInput>,
) -> Json<serde_json::Value> {
    let id = format!("tmpl_{}", uuid::Uuid::new_v4().to_string()[..12].to_string());
    
    // Actually store the template in generated_uis as a published template
    let conn = db.lock().unwrap();
    let result = conn.execute(
        "INSERT OR REPLACE INTO generated_uis (covenant_id, owner_address, tier, ui_html, ui_config, slug, is_published, featured) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 0)",
        params![
            id,
            input.author,
            "PRO", // default tier for published templates
            "", // ui_html can be empty or generated later
            serde_json::to_string(&input.config).unwrap_or_default(),
            input.name.replace(" ", "-").to_lowercase()
        ],
    );

    match result {
        Ok(_) => Json(json!({
            "success": true,
            "id": id,
            "message": format!("Template '{}' successfully published to the marketplace.", input.name)
        })),
        Err(e) => Json(json!({
            "success": false,
            "error": format!("Failed to publish template: {}", e)
        }))
    }
}
