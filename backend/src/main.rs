use anyhow::{Context, Result};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use kaspa_consensus_core::network::NetworkId;
use std::str::FromStr;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::prelude::*;
use kaspa_wrpc_client::KaspaRpcClient;
use serde::{Deserialize, Serialize};
use std::env;
use std::io::Write;
use std::process::Command;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tracing::{error, info};

mod covenant_types;
mod db;
mod indexer;
mod payment_verifier;
mod ui_generator;

struct AppState {
    client: Arc<std::sync::Mutex<Option<Arc<KaspaRpcClient>>>>,
    network: NetworkId,
    db: Arc<Mutex<rusqlite::Connection>>,
    treasury_address: String,
    w_rpc_url: String,
}

#[derive(Serialize)]
struct StatusResponse {
    connected: bool,
    network: String,
    network_id: u8,
    w_rpc_url: String,
    tip_hash: Option<String>,
    tip_daa_score: Option<u64>,
    total_covenants: i64,
    active_covenants: i64,
}

#[derive(Serialize)]
struct UtxoEntry {
    tx_id: String,
    address: String,
    amount_sompi: u64,
    amount_kaspa: f64,
    is_coinbase: bool,
    block_daa_score: u64,
    name: Option<String>,
    category: Option<String>,
    tier: Option<String>,
    description: Option<String>,
    script_hash: Option<String>,
    covenant_type: Option<String>,
    image: Option<String>,
}

#[derive(Serialize)]
struct UtxosResponse {
    count: usize,
    utxos: Vec<UtxoEntry>,
    total_indexed: i64,
    network: String,
}

#[derive(Serialize)]
struct CovenantsResponse {
    total: usize,
    grand_total: i64,
    categories: Vec<String>,
    tiers: Vec<TierInfoResponse>,
    treasury: String,
    covenants: Vec<CovenantResponse>,
}

#[derive(Serialize)]
struct TierInfoResponse {
    name: String,
    price: u64,
    label: String,
}

#[derive(Serialize)]
struct CovenantResponse {
    tx_id: String,
    address: String,
    amount_kaspa: f64,
    amount_sompi: u64,
    script_hash: String,
    covenant_type: String,
    category: String,
    creator_addr: String,
    description: String,
    tier: String,
    name: String,
    image: Option<String>,
    verified_tier: String,
    verified_payment_tx: Option<String>,
    verified_at: Option<i64>,
    custom_ui_enabled: bool,
    disclosure_level: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    parameters: Vec<covenant_types::UiParameter>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Deserialize)]
struct CompileRequest {
    code: String,
}

#[derive(Serialize)]
struct CompileResponse {
    success: bool,
    script_template_hash: String,
    bytecode: String,
}

#[derive(Deserialize)]
struct GenerateUiRequest {
    tx_id: String,
    name: String,
    category: Option<String>,
    parameters: Option<Vec<covenant_types::UiParameter>>,
}

#[derive(Serialize)]
struct GenerateUiResponse {
    success: bool,
    slug: String,
    ui_html: String,
}

#[derive(Deserialize)]
struct CovenantsQuery {
    category: Option<String>,
    tier: Option<String>,
    search: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}

#[derive(Deserialize)]
struct PaymentVerifyQuery {
    tx_id: String,
}

fn env_or(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

fn resolve_network(network_str: &str) -> Result<NetworkId> {
    NetworkId::from_str(network_str)
        .map_err(|e| anyhow::anyhow!("Unknown KASPA_NETWORK: {} ({})", network_str, e))
}

fn compute_script_hash(script_hex: &str) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(script_hex.as_bytes());
    format!("{:x}", hasher.finalize())
}

async fn root_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "app": "Covex27",
        "version": "1.0.0",
        "description": "Kaspa Covenant Explorer - Rust Backend",
        "endpoints": {
            "/": "this info",
            "/health": "basic health check",
            "/status": "node connection + DB stats",
            "/covenants": "list all covenants"
        }
    }))
}

async fn health_handler() -> &'static str { "OK" }

async fn status_handler(State(state): State<Arc<AppState>>) -> Result<Json<StatusResponse>, StatusCode> {
    let rpc: Option<Arc<KaspaRpcClient>> = {
        let guard = state.client.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        guard.clone()
    };
    let connected = rpc.as_ref().map(|c| c.is_connected()).unwrap_or(false);
    let (tip_hash, tip_daa_score) = if let Some(ref c) = rpc {
        match c.get_block_dag_info().await {
            Ok(resp) => (
                resp.virtual_parent_hashes.first().map(|h| h.to_string()),
                Some(resp.virtual_daa_score),
            ),
            Err(e) => {
                error!("RPC get_block_dag_info failed: {e}");
                (None, None)
            }
        }
    } else {
        (None, None)
    };
    let total_covenants = db::count_covenants(&state.db).unwrap_or(0);
    let active_covenants = db::count_active_covenants(&state.db).unwrap_or(0);
    Ok(Json(StatusResponse {
        connected,
        network: env_or("KASPA_NETWORK", "testnet-12"),
        network_id: state.network.network_type as u8,
        w_rpc_url: state.w_rpc_url.clone(),
        tip_hash,
        tip_daa_score,
        total_covenants,
        active_covenants,
    }))
}

async fn utxos_handler(
    State(state): State<Arc<AppState>>,
    query: Query<CovenantsQuery>,
) -> Result<Json<UtxosResponse>, StatusCode> {
    let stored = db::get_all_covenants(&state.db).map_err(|e| {
        error!("DB query failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut utxos: Vec<UtxoEntry> = stored
        .into_iter()
        .map(|u| {
            let account_tier = db::get_account_tier(&state.db, &u.creator_addr)
                .unwrap_or_else(|_| "FREE".to_string());
            let name = if u.description.is_empty() {
                format!("Covenant {}", &u.tx_id[..8])
            } else {
                u.covenant_type.clone()
            };
            UtxoEntry {
                tx_id: u.tx_id,
                address: u.address,
                amount_sompi: u.amount_sompi,
                amount_kaspa: u.amount_kaspa,
                is_coinbase: u.amount_kaspa == 0.0,
                block_daa_score: u.block_daa_score,
                name: Some(name),
                category: Some(u.category.clone()),
                tier: Some(account_tier),
                description: if u.description.is_empty() { None } else { Some(u.description) },
                script_hash: if u.script_hash.is_empty() { None } else { Some(u.script_hash) },
                covenant_type: Some(u.covenant_type),
                image: None,
            }
        })
        .collect();

    // Filter by category
    if let Some(ref cat) = query.category {
        utxos.retain(|u| u.category.as_deref() == Some(cat.as_str()));
    }
    // Filter by tier
    if let Some(ref t) = query.tier {
        utxos.retain(|u| u.tier.as_deref() == Some(t.as_str()));
    }
    // Filter by search
    if let Some(ref q) = query.search {
        let q = q.to_lowercase();
        utxos.retain(|u| {
            u.name.as_deref().unwrap_or("").to_lowercase().contains(&q)
                || u.description.as_deref().unwrap_or("").to_lowercase().contains(&q)
                || u.tx_id.to_lowercase().contains(&q)
        });
    }

    let count = utxos.len();
    let offset = query.offset.unwrap_or(0);
    let limit = query.limit.unwrap_or(utxos.len().max(1));
    if offset > 0 || limit < utxos.len() {
        utxos = utxos.into_iter().skip(offset).take(limit).collect();
    }

    let total_indexed = db::count_covenants(&state.db).unwrap_or(0);
    Ok(Json(UtxosResponse {
        count,
        utxos,
        total_indexed,
        network: env_or("KASPA_NETWORK", "testnet-12"),
    }))
}

async fn covenants_handler(
    State(state): State<Arc<AppState>>,
    query: Query<CovenantsQuery>,
) -> Result<Json<CovenantsResponse>, StatusCode> {
    let stored = db::get_all_covenants(&state.db).map_err(|e| {
        error!("DB query failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let tiers = covenant_types::get_tiers();
    let tier_prices: Vec<TierInfoResponse> = tiers
        .iter()
        .map(|t| TierInfoResponse {
            name: t.name.clone(),
            price: t.price_kas,
            label: t.label.clone(),
        })
        .collect();

    let categories: Vec<String> = stored
        .iter()
        .map(|u| u.category.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let mut covenants: Vec<CovenantResponse> = stored
        .into_iter()
        .map(|u| {
            let account_tier = db::get_account_tier(&state.db, &u.creator_addr)
                .unwrap_or_else(|_| "FREE".to_string());
            let disclosure = crate::covenant_types::DisclosureLevel::from_tier(&account_tier);
            let name = if u.description.is_empty() {
                format!("Covenant {}", &u.tx_id[..8])
            } else {
                u.covenant_type.clone()
            };
            let params = crate::ui_generator::extract_parameters_from_script(&u.script_hex, &u.script_hash);
            CovenantResponse {
                tx_id: u.tx_id,
                address: u.address,
                amount_kaspa: u.amount_kaspa,
                amount_sompi: u.amount_sompi,
                script_hash: u.script_hash,
                covenant_type: u.covenant_type,
                category: u.category,
                creator_addr: u.creator_addr,
                description: u.description,
                tier: account_tier.clone(),
                name,
                image: None,
                verified_tier: u.verified_tier.clone(),
                verified_payment_tx: u.verified_payment_tx.clone(),
                verified_at: u.verified_at,
                custom_ui_enabled: u.custom_ui_enabled,
                disclosure_level: format!("{:?}", disclosure).to_lowercase(),
                parameters: params,
            }
        })
        .collect();

    // Filter
    if let Some(ref cat) = query.category {
        covenants.retain(|c| c.category == *cat);
    }
    if let Some(ref t) = query.tier {
        covenants.retain(|c| c.tier == *t);
    }
    if let Some(ref q) = query.search {
        let q = q.to_lowercase();
        covenants.retain(|c| {
            c.name.to_lowercase().contains(&q)
                || c.description.to_lowercase().contains(&q)
                || c.tx_id.to_lowercase().contains(&q)
        });
    }

    let total = covenants.len();
    let grand_total = db::count_covenants(&state.db).unwrap_or(0);

    Ok(Json(CovenantsResponse {
        total,
        grand_total,
        categories,
        tiers: tier_prices,
        treasury: state.treasury_address.clone(),
        covenants,
    }))
}

async fn compile_handler(
    Json(payload): Json<CompileRequest>,
) -> Result<Json<CompileResponse>, (StatusCode, Json<ErrorResponse>)> {
    let code = payload.code.trim().to_string();
    if code.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "No SilverScript code provided".into(),
            }),
        ));
    }
    let tmpdir = env::temp_dir();
    let input_path = tmpdir.join("covex27_covenant.sil");
    let output_path = tmpdir.join("covex27_covenant.json");
    {
        let mut f = std::fs::File::create(&input_path).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Temp file create: {e}"),
                }),
            )
        })?;
        f.write_all(code.as_bytes()).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Temp file write: {e}"),
                }),
            )
        })?;
    }
    let output = Command::new("silverc")
        .arg("compile")
        .arg(&input_path)
        .arg("-o")
        .arg(&output_path)
        .output()
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("silverc not found: {e}. Install the SilverScript compiler."),
                }),
            )
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(ErrorResponse {
                error: format!("Compilation failed:\n{}", stderr.trim()),
            }),
        ));
    }
    let raw =
        std::fs::read_to_string(&output_path).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Read output: {e}"),
                }),
            )
        })?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Parse output: {e}"),
            }),
        )
    })?;
    let script_template_hash = parsed["scriptTemplateHash"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    let bytecode = parsed["bytecode"].as_str().unwrap_or("").to_string();
    let _ = std::fs::remove_file(&input_path);
    let _ = std::fs::remove_file(&output_path);
    Ok(Json(CompileResponse {
        success: true,
        script_template_hash,
        bytecode,
    }))
}

async fn generate_ui_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<GenerateUiRequest>,
) -> Result<Json<GenerateUiResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Verify the user has paid for a tier above EXPLORER
    let account_tier = db::get_account_tier(&state.db, &payload.tx_id)
        .unwrap_or_else(|_| "FREE".to_string());

    if account_tier == "FREE" || account_tier == "EXPLORER" {
        return Err((
            StatusCode::PAYMENT_REQUIRED,
            Json(ErrorResponse {
                error: "Payment required: Upgrade to Creator tier or higher for interactive UI generation."
                    .into(),
            }),
        ));
    }

    let params = payload.parameters.unwrap_or_else(|| {
        ui_generator::extract_parameters_from_script("aa20", "unknown")
    });

    let config = covenant_types::UiGenerationConfig {
        covenant_id: payload.tx_id.clone(),
        covenant_name: payload.name.clone(),
        category: payload.category.unwrap_or_else(|| "General".into()),
        script_hash: "script_hash_placeholder".into(),
        parameters: params,
        is_enhanced: true,
        disclosure_level: "full".into(),
        creator_addr: payload.tx_id.clone(),
    };

    let ui_html = ui_generator::generate_enhanced_ui(&config, &account_tier);
    let slug = format!("covenant-{}", &payload.tx_id[..16]);

    // Save to database
    let featured = account_tier == "MAX" || account_tier == "PRO";
    db::save_generated_ui(
        &state.db,
        &payload.tx_id,
        &payload.tx_id,
        &account_tier,
        &ui_html,
        "{}",
        &slug,
        featured,
    )
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to save UI: {e}"),
            }),
        )
    })?;

    // Set visibility based on tier
    let priority = match account_tier.as_str() {
        "MAX" => 100,
        "PRO" => 50,
        "CREATOR" => 10,
        _ => 0,
    };
    db::set_visibility(&state.db, &payload.tx_id, &account_tier, featured, priority, None)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to set visibility: {e}"),
                }),
            )
        })?;

    Ok(Json(GenerateUiResponse {
        success: true,
        slug,
        ui_html,
    }))
}

async fn tiers_handler() -> Json<Vec<covenant_types::TierInfo>> {
    Json(covenant_types::get_tiers())
}

async fn covenant_ui_handler(
    State(state): State<Arc<AppState>>,
    Path(covenant_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let ui = db::get_generated_ui_by_covenant(&state.db, &covenant_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: format!("DB error: {e}") })))?;
    match ui {
        Some(data) => Ok(Json(data)),
        None => Err((StatusCode::NOT_FOUND, Json(ErrorResponse { error: "No generated UI found for this covenant".into() }))),
    }
}

async fn payment_verify_handler(
    State(state): State<Arc<AppState>>,
    query: Query<PaymentVerifyQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let rpc_client = {
        let guard = state.client.lock().map_err(|_| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "Lock error".into() }))
        })?;
        match guard.as_ref() {
            Some(c) if c.is_connected() => Some(c.clone()),
            _ => None,
        }
    };
    let rpc_client = match rpc_client {
        Some(c) => c,
        None => return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "wRPC node not connected".into(),
            }),
        )),
    };
    match payment_verifier::verify_payment(&rpc_client, &query.tx_id).await {
        Ok(status) => Ok(Json(serde_json::json!({
            "tx_id": status.tx_id,
            "confirmed": status.confirmed,
            "confirmations": status.confirmations,
            "amount_sompi": status.amount_sompi,
            "amount_kaspa": status.amount_sompi as f64 / 100_000_000.0,
            "tier": status.tier,
        }))),
        Err(e) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Payment not found: {e}"),
            }),
        )),
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            env::var("RUST_LOG")
                .unwrap_or_else(|_| "covex27_backend=debug,kaspa_wrpc=info".into()),
        )
        .init();

    let network_str = env_or("KASPA_NETWORK", "testnet-12");
    let w_rpc_url = env_or("KASPA_WRPC_URL", "ws://127.0.0.1:17110");
    let bind_addr = env_or("BIND_ADDR", "0.0.0.0:3001");
    let treasury_address = env_or(
        "COVENANT_TREASURY_ADDRESS",
        "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m",
    );
    let network = resolve_network(&network_str)?;

    info!("Covex backend -- network: {network_str}  wRPC: {w_rpc_url}  bind: {bind_addr}");
    info!("Treasury: {treasury_address}");

    let covenant_seeds: Vec<String> = if let Ok(raw) = env::var("COVENANT_SEED_ADDRESSES") {
        raw.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
    } else {
        vec![]
    };

    let db_path = env_or("DB_PATH", "../covex.db");
    let db = Arc::new(db::open_db(&db_path)?);
    info!("Database opened at {db_path}");

    // Try wRPC connection in background - don't block server startup
    let client: Arc<Mutex<Option<Arc<KaspaRpcClient>>>> = Arc::new(Mutex::new(None));
    let w_rpc_url_clone = w_rpc_url.clone();
    let db_clone = Arc::clone(&db);
    let seeds_clone = covenant_seeds.clone();
    let treasury_addr_clone = treasury_address.clone();
    let client_clone = Arc::clone(&client);
    tokio::spawn(async move {
        info!("[wRPC] Attempting connection to {w_rpc_url_clone} in background...");
        match KaspaRpcClient::new_with_args(WrpcEncoding::Borsh, Some(&w_rpc_url_clone), None, None, None) {
            Ok(rpc_client) => {
                match rpc_client.connect(None).await {
                    Ok(_) => {
                        info!("[wRPC] Connected!");
                        let rpc = Arc::new(rpc_client);
                        *client_clone.lock().unwrap() = Some(rpc.clone());
                        let idx_client = rpc.clone();
                        let idx_db = Arc::clone(&db_clone);
                        tokio::spawn(async move { indexer::run_indexer(idx_client, idx_db, seeds_clone).await; });
                        let pay_client = rpc.clone();
                        let pay_db = Arc::clone(&db_clone);
                        tokio::spawn(async move { payment_verifier::run_payment_verifier(pay_client, pay_db, treasury_addr_clone).await; });
                    }
                    Err(e) => error!("[wRPC] Connection failed: {e} - running without node"),
                }
            }
            Err(e) => error!("[wRPC] Client creation failed: {e} - running without node"),
        }
    });

    let state = Arc::new(AppState {
        client,
        network,
        db,
        treasury_address,
        w_rpc_url,
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(health_handler))
        .route("/status", get(status_handler))
        .route("/covenants", get(covenants_handler))
        .route("/api/health", get(health_handler))
        .route("/api/status", get(status_handler))
        .route("/api/utxos", get(utxos_handler))
        .route("/api/covenants", get(covenants_handler))
        .route("/api/covenant/:id/ui", get(covenant_ui_handler))
        .route("/api/compile", post(compile_handler))
        .route("/api/generate-ui", post(generate_ui_handler))
        .route("/api/tiers", get(tiers_handler))
        .route("/api/verify-payment", get(payment_verify_handler))
        .layer(RequestBodyLimitLayer::new(5 * 1024 * 1024)) // 5MB limit
        .layer(cors)
        .with_state(state);

    info!("Listening on {bind_addr}");
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .context("Bind failed")?;
    axum::serve(listener, app)
        .await
        .context("Server exited")?;
    Ok(())
}
