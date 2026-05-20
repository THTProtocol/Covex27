use anyhow::{Context, Result};
use axum::{
    extract::State,
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
use tracing::{error, info};

mod db;
mod indexer;

struct AppState {
    client: Arc<KaspaRpcClient>,
    network: NetworkId,
    db: Arc<Mutex<rusqlite::Connection>>,
}

#[derive(Serialize)]
struct StatusResponse {
    connected: bool,
    network: String,
    network_id: u8,
    w_rpc_url: String,
    tip_hash: Option<String>,
    tip_daa_score: Option<u64>,
}

#[derive(Serialize)]
struct UtxoEntry {
    tx_id: String,
    address: String,
    amount_sompi: u64,
    amount_kaspa: f64,
    is_coinbase: bool,
    block_daa_score: u64,
}

#[derive(Serialize)]
struct UtxosResponse {
    count: usize,
    utxos: Vec<UtxoEntry>,
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

fn env_or(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

fn resolve_network(network_str: &str) -> Result<NetworkId> {
    NetworkId::from_str(network_str).map_err(|e| anyhow::anyhow!("Unknown KASPA_NETWORK: {} ({})", network_str, e))
}

async fn health_handler() -> &'static str { "OK" }

async fn status_handler(State(state): State<Arc<AppState>>) -> Result<Json<StatusResponse>, StatusCode> {
    let connected = state.client.is_connected();
    let (tip_hash, tip_daa_score) = if connected {
        match state.client.get_block_dag_info().await {
            Ok(resp) => (
                resp.virtual_parent_hashes.first().map(|h| h.to_string()),
                Some(resp.virtual_daa_score),
            ),
            Err(e) => { error!("RPC get_block_dag_info failed: {e}"); (None, None) }
        }
    } else { (None, None) };
    Ok(Json(StatusResponse {
        connected,
        network: env_or("KASPA_NETWORK", "testnet-12"),
        network_id: state.network.network_type as u8,
        w_rpc_url: env_or("KASPA_WRPC_URL", "ws://127.0.0.1:17110"),
        tip_hash,
        tip_daa_score,
    }))
}

async fn utxos_handler(State(state): State<Arc<AppState>>) -> Result<Json<UtxosResponse>, StatusCode> {
    let stored = db::get_all_covenants(&state.db).map_err(|e| {
        error!("DB query failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let utxos: Vec<UtxoEntry> = stored.into_iter().map(|u| {
        let amount_sompi = (u.amount_kaspa * 100_000_000.0) as u64;
        UtxoEntry { tx_id: u.tx_id, address: u.address, amount_sompi, amount_kaspa: u.amount_kaspa, is_coinbase: false, block_daa_score: 0 }
    }).collect();
    Ok(Json(UtxosResponse { count: utxos.len(), utxos }))
}

async fn compile_handler(
    Json(payload): Json<CompileRequest>,
) -> Result<Json<CompileResponse>, (StatusCode, Json<ErrorResponse>)> {
    let code = payload.code.trim().to_string();
    if code.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "No SilverScript code provided".into() })));
    }
    let tmpdir = env::temp_dir();
    let input_path = tmpdir.join("covex27_covenant.sil");
    let output_path = tmpdir.join("covex27_covenant.json");
    {
        let mut f = std::fs::File::create(&input_path).map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: format!("Temp file create: {e}") }))
        })?;
        f.write_all(code.as_bytes()).map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: format!("Temp file write: {e}") }))
        })?;
    }
    let output = Command::new("silverc")
        .arg("compile").arg(&input_path).arg("-o").arg(&output_path)
        .output().map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: format!("silverc not found: {e}. Install the SilverScript compiler.") }))
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err((StatusCode::UNPROCESSABLE_ENTITY, Json(ErrorResponse { error: format!("Compilation failed:\n{}", stderr.trim()) })));
    }
    let raw = std::fs::read_to_string(&output_path).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: format!("Read output: {e}") }))
    })?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: format!("Parse output: {e}") }))
    })?;
    let script_template_hash = parsed["scriptTemplateHash"].as_str().unwrap_or("unknown").to_string();
    let bytecode = parsed["bytecode"].as_str().unwrap_or("").to_string();
    let _ = std::fs::remove_file(&input_path);
    let _ = std::fs::remove_file(&output_path);
    Ok(Json(CompileResponse { success: true, script_template_hash, bytecode }))
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "covex27_backend=debug,kaspa_wrpc=info".into()))
        .init();

    let network_str = env_or("KASPA_NETWORK", "testnet-12");
    let w_rpc_url = env_or("KASPA_WRPC_URL", "ws://127.0.0.1:17110");
    let bind_addr = env_or("BIND_ADDR", "0.0.0.0:3001");
    let network = resolve_network(&network_str)?;

    info!("Covex27 backend -- network: {network_str}  wRPC: {w_rpc_url}  bind: {bind_addr}");

    let covenant_seeds: Vec<String> = vec![];
    let db_path = env_or("DB_PATH", "../covex.db");
    let db = Arc::new(db::open_db(&db_path)?);
    info!("Database opened at {db_path}");

    info!("Connecting to Kaspa wRPC node...");
    let client = Arc::new(
        KaspaRpcClient::new_with_args(WrpcEncoding::Borsh, Some(&w_rpc_url), None, None, None)
            .context("Failed to create KaspaRpcClient")?,
    );
    client.connect(None).await.context("Failed to connect to wRPC node")?;
    info!("Connected to wRPC node");

    let indexer_db = Arc::clone(&db);
    let indexer_client = Arc::clone(&client);
    let indexer_seeds = covenant_seeds.clone();
    tokio::spawn(async move {
        indexer::run_indexer(indexer_client, indexer_db, indexer_seeds).await;
    });

    let state = Arc::new(AppState { client, network, db });

    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    let app = Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/status", get(status_handler))
        .route("/api/utxos", get(utxos_handler))
        .route("/api/compile", post(compile_handler))
        .layer(cors)
        .with_state(state);

    info!("Listening on {bind_addr}");
    let listener = tokio::net::TcpListener::bind(&bind_addr).await.context("Bind failed")?;
    axum::serve(listener, app).await.context("Server exited")?;
    Ok(())
}
