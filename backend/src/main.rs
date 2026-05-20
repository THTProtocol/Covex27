use anyhow::{Context, Result};
use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use kaspa_addresses::{Address, Prefix};
use kaspa_consensus_core::network::{NetworkId, NetworkType};
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_wrpc_client::prelude::*;
use kaspa_wrpc_client::KaspaRpcClient;
use serde::{Deserialize, Serialize};
use std::env;
use std::io::Write;
use std::process::Command;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};

// ── App State ───────────────────────────────────────────────────────────

struct AppState {
    client: KaspaRpcClient,
    network: NetworkId,
    /// Addresses we know carry covenant UTXOs (seed addresses)
    covenant_seeds: Vec<String>,
}

// ── Response types ──────────────────────────────────────────────────────

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
    address: String,
    tx_id: String,
    index: u32,
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

// ── Compile types ─────────────────────────────────────────────────────

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

// ── Environment helpers ─────────────────────────────────────────────────

fn env_or(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

// ── Network resolution ──────────────────────────────────────────────────

/// Resolve NetworkId from the KASPA_NETWORK env var.
///
/// Accepted: "mainnet" | "testnet-10" | "testnet-11" | "testnet-12" | "devnet"
fn resolve_network(network_str: &str) -> Result<NetworkId> {
    match network_str.to_lowercase().as_str() {
        "mainnet" => Ok(NetworkId::new(NetworkType::Mainnet)),
        "testnet-10" => Ok(NetworkId::new(NetworkType::Testnet)),
        "testnet-11" => Ok(NetworkId::new(NetworkType::Testnet)),
        "testnet-12" => Ok(NetworkId::new(NetworkType::Testnet)),
        "devnet" => Ok(NetworkId::new(NetworkType::Devnet)),
        other => Err(anyhow::anyhow!("Unknown KASPA_NETWORK: {}", other)),
    }
}

/// Derive the human-readable address prefix from the network string.
fn address_prefix(network_str: &str) -> &'static str {
    if network_str == "mainnet" {
        "kaspa"
    } else {
        "kaspatest"
    }
}

// ── Routes ──────────────────────────────────────────────────────────────

async fn status_handler(State(state): State<Arc<AppState>>) -> Result<Json<StatusResponse>, StatusCode> {
    let connected = state.client.is_connected();

    let (tip_hash, tip_daa_score) = if connected {
        match state.client.get_virtual_daa_score().await {
            Ok(resp) => (
                Some(resp.virtual_parents.first().map(|h| h.to_string()).unwrap_or_default()),
                Some(resp.virtual_daa_score),
            ),
            Err(e) => {
                error!("RPC get_virtual_daa_score failed: {e}");
                (None, None)
            }
        }
    } else {
        (None, None)
    };

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
    let connected = state.client.is_connected();
    if !connected {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    // Collect UTXOs from all known covenant seed addresses.
    let mut all_utxos: Vec<UtxoEntry> = Vec::new();

    for seed_addr in &state.covenant_seeds {
        let addr = match Address::try_from(seed_addr.as_str()) {
            Ok(a) => a,
            Err(e) => {
                error!("Invalid seed address {seed_addr}: {e}");
                continue;
            }
        };

        match state.client.get_utxos_by_addresses(vec![addr]).await {
            Ok(entries) => {
                for entry in entries {
                    all_utxos.push(UtxoEntry {
                        address: entry.address.map(|a| a.to_string()).unwrap_or_default(),
                        tx_id: entry.outpoint.transaction_id.to_string(),
                        index: entry.outpoint.index,
                        amount_sompi: entry.utxo_entry.amount,
                        amount_kaspa: entry.utxo_entry.amount as f64 / 100_000_000.0,
                        is_coinbase: entry.utxo_entry.is_coinbase,
                        block_daa_score: entry.utxo_entry.block_daa_score,
                    });
                }
            }
            Err(e) => {
                error!("get_utxos_by_addresses failed for {seed_addr}: {e}");
            }
        }
    }

    Ok(Json(UtxosResponse {
        count: all_utxos.len(),
        utxos: all_utxos,
    }))
}

async fn health_handler() -> &'static str {
    "OK"
}

// ── Compile handler ──────────────────────────────────────────────────

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

    // Write SilverScript code to a temp file
    let tmpdir = env::temp_dir();
    let input_path = tmpdir.join("covex27_covenant.sil");
    let output_path = tmpdir.join("covex27_covenant.json");

    {
        let mut file = std::fs::File::create(&input_path).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to create temp file: {e}"),
                }),
            )
        })?;
        file.write_all(code.as_bytes()).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to write temp file: {e}"),
                }),
            )
        })?;
    }

    // Run `silverc compile <input> -o <output>`
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
                    error: format!("Failed to execute silverc: {e}. Is the compiler installed?"),
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

    // Parse the output JSON
    let raw = std::fs::read_to_string(&output_path).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to read compiler output: {e}"),
            }),
        )
    })?;

    // silverc outputs { "scriptTemplateHash": "...", "bytecode": "..." }
    let parsed: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to parse compiler output: {e}"),
            }),
        )
    })?;

    let script_template_hash = parsed["scriptTemplateHash"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let bytecode = parsed["bytecode"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Clean up temp files
    let _ = std::fs::remove_file(&input_path);
    let _ = std::fs::remove_file(&output_path);

    Ok(Json(CompileResponse {
        success: true,
        script_template_hash,
        bytecode,
    }))
}

// ── Main ────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env from project root (two dirs up from backend/)
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::dotenv(); // fallback: PWD .env

    tracing_subscriber::fmt()
        .with_env_filter(
            env::var("RUST_LOG").unwrap_or_else(|_| "covex27_backend=debug,kaspa_wrpc=info".to_string()),
        )
        .init();

    // ── Config from environment ──────────────────────────────────────
    let network_str = env_or("KASPA_NETWORK", "testnet-12");
    let w_rpc_url   = env_or("KASPA_WRPC_URL", "ws://127.0.0.1:17110");
    let bind_addr   = env_or("BIND_ADDR", "0.0.0.0:3001");

    let network = resolve_network(&network_str)?;
    let prefix_str = address_prefix(&network_str);

    info!("Network: {network_str} (prefix={prefix_str})");
    info!("wRPC: {w_rpc_url}");
    info!("Bind: {bind_addr}");

    // ── Covenant seed addresses ─────────────────────────────────────
    //
    // These are the addresses we know deploy covenant contracts.
    // On TN12 a few well-known covenant addresses exist — we seed the
    // scanner with these and let the client fan out from UTXO parents.
    //
    // Add more as you discover covenant-bearing outputs.
    let covenant_seeds: Vec<String> = vec![
        // Example TN12 covenant addresses (replace with real ones)
        // format: "kaspatest:qq..."
    ];

    // ── Connect to wRPC node ────────────────────────────────────────
    info!("Connecting to Kaspa wRPC node at {w_rpc_url}");
    let client = KaspaRpcClient::new_with_args(
        WrpcEncoding::Borsh,
        Some(&w_rpc_url),
        None,
        None,
        Some(network),
    )
    .context("Failed to create KaspaRpcClient")?;

    client.connect().await.context("Failed to connect to wRPC node")?;
    info!("Connected — node is reachable");

    let state = Arc::new(AppState {
        client,
        network,
        covenant_seeds,
    });

    // ── Axum router ─────────────────────────────────────────────────
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/status", get(status_handler))
        .route("/api/utxos", get(utxos_handler))
        .route("/api/compile", post(compile_handler))
        .layer(cors)
        .with_state(state);

    info!("Covex27 backend listening on {bind_addr}");
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .context(format!("Failed to bind {bind_addr}"))?;

    axum::serve(listener, app)
        .await
        .context("Server exited with error")?;

    Ok(())
}
