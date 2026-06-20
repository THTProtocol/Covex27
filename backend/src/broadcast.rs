use axum::{
    extract::{Path, Query},
    routing::{get, post},
    Extension, Json, Router,
};
use kaspa_addresses::Address;
use kaspa_consensus_core::tx::Transaction;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_rpc_core::RpcTransaction;
use kaspa_wrpc_client::KaspaRpcClient;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{info, warn};
use workflow_serializer::prelude::BorshDeserialize;

/// Resolve wRPC for network (on-demand, so /broadcast and balance checks target the chosen net).
async fn client_for_network(network: &str) -> Result<Arc<KaspaRpcClient>, String> {
    let wrpc = if network == "testnet-10" {
        std::env::var("KASPA_WRPC_URL_TN10").unwrap_or_else(|_| "ws://127.0.0.1:17210".to_string())
    } else if network == "mainnet" || network == "mainnet-1" {
        std::env::var("KASPA_WRPC_URL_MAINNET")
            .unwrap_or_else(|_| "ws://127.0.0.1:17310".to_string())
    } else {
        // testnet-12 (default): prefer the per-net var, then the global KASPA_WRPC_URL the
        // crawler uses, then a sane local default. Root cause of /balance and /utxos
        // hanging: KASPA_WRPC_URL_TN12 is unset and the old 17217 default is dead (the live
        // TN12 node is on 17219, reached by the crawler via KASPA_WRPC_URL).
        std::env::var("KASPA_WRPC_URL_TN12")
            .or_else(|_| std::env::var("KASPA_WRPC_URL"))
            .unwrap_or_else(|_| "ws://127.0.0.1:17219".to_string())
    };
    let c = kaspa_wrpc_client::KaspaRpcClient::new(
        kaspa_wrpc_client::WrpcEncoding::Borsh,
        Some(&wrpc),
        None,
        None,
        None,
    )
    .map_err(|e| format!("wRPC create failed for {}: {}", network, e))?;
    let _ = c.connect(None).await;
    Ok(Arc::new(c))
}

// ── TX broadcast endpoint ────────────────────────────────────────
//
// STRICT: This endpoint ONLY receives the signed hex, broadcasts it to the
// local node's mempool via wRPC, and returns the tx_id. No database writes
// whatsoever. The crawler is the ONLY code path allowed to index covenants
// into covex.db - it discovers them natively on the DAG and verifies
// treasury outputs to determine tier.

#[derive(Deserialize, Debug)]
pub struct BroadcastRequest {
    pub tx_hex: String,
    pub deployer_addr: String,
    #[serde(default)]
    pub script_hex: String,
    #[serde(default)]
    pub script_name: Option<String>,
    #[serde(default)]
    pub tier: Option<String>,
    /// Network for this broadcast. Allows a TN12-primary backend to broadcast to TN10 node.
    #[serde(default = "default_network")]
    pub network: String,
}

fn default_network() -> String {
    "testnet-12".to_string()
}

/// POST /broadcast - accepts a signed Kaspa transaction hex, parses, broadcasts via wRPC
pub async fn broadcast_handler(
    Extension(_client): Extension<Arc<KaspaRpcClient>>, // kept for router layer compat; we use on-demand below
    Json(payload): Json<BroadcastRequest>,
) -> Json<serde_json::Value> {
    let tx_hex = payload.tx_hex.trim();
    let net = &payload.network;

    // On-demand client so a broadcast POST with network=testnet-10 goes to the TN10 node.
    let client: Arc<KaspaRpcClient> = match client_for_network(net).await {
        Ok(c) => c,
        Err(e) => {
            return Json(serde_json::json!({
                "success": false,
                "tx_id": null,
                "error": format!("Failed to reach {} node for broadcast: {}", net, e)
            }));
        }
    };

    // Decode hex into bytes
    let tx_bytes = match hex::decode(tx_hex) {
        Ok(b) => b,
        Err(e) => {
            return Json(serde_json::json!({
                "success": false,
                "tx_id": null,
                "error": format!("Invalid hex: {}", e)
            }));
        }
    };

    // Deserialize bytes -> consensus Transaction -> RpcTransaction
    let consensus_tx = match Transaction::try_from_slice(&tx_bytes) {
        Ok(tx) => tx,
        Err(e) => {
            return Json(serde_json::json!({
                "success": false,
                "tx_id": null,
                "error": format!("Failed to parse transaction: {}", e)
            }));
        }
    };

    let rpc_tx: RpcTransaction = RpcTransaction::from(&consensus_tx);

    // Submit to node via wRPC - no DB writes, no auto-indexing
    match client.submit_transaction(rpc_tx, false).await {
        Ok(tx_id) => {
            let tx_id_str = tx_id.to_string();
            info!("Broadcast success: tx_id={}", tx_id_str);
            Json(serde_json::json!({
                "success": true,
                "tx_id": tx_id_str,
                "error": null
            }))
        }
        Err(e) => {
            warn!("Broadcast failed: {}", e);
            Json(serde_json::json!({
                "success": false,
                "tx_id": null,
                "error": format!("Broadcast rejected: {}", e)
            }))
        }
    }
}

// ── UTXOs endpoint ───────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct UtxoEntry {
    pub tx_id: String,
    pub index: u32,
    pub amount: u64,
    pub script_hex: String,
}

/// GET /utxos/:address - fetch UTXOs for a Kaspa address from the wRPC node
/// Supports ?network=testnet-10 so balance/UTXO checks before deploy target the chosen net.
pub async fn utxos_handler(
    Path(addr_str): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    Extension(_client): Extension<Arc<KaspaRpcClient>>,
) -> Json<serde_json::Value> {
    let addr = match Address::try_from(addr_str.as_str()) {
        Ok(a) => a,
        Err(e) => {
            return Json(serde_json::json!({
                "utxos": [],
                "error": format!("Invalid address: {}", e)
            }));
        }
    };

    let net = params
        .get("network")
        .cloned()
        .unwrap_or_else(|| "testnet-12".to_string());
    let client: Arc<KaspaRpcClient> = match client_for_network(&net).await {
        Ok(c) => c,
        Err(e) => {
            return Json(serde_json::json!({
                "utxos": [],
                "error": format!("Failed to reach {} node: {}", net, e)
            }));
        }
    };

    match client.get_utxos_by_addresses(vec![addr]).await {
        Ok(entries) => {
            let utxos: Vec<UtxoEntry> = entries
                .into_iter()
                .map(|entry| {
                    let tx_id = entry.outpoint.transaction_id.to_string();
                    let index = entry.outpoint.index;
                    let amount = entry.utxo_entry.amount;
                    let script_hex = hex::encode(entry.utxo_entry.script_public_key.script());
                    UtxoEntry {
                        tx_id,
                        index,
                        amount,
                        script_hex,
                    }
                })
                .collect();
            Json(serde_json::json!({ "utxos": utxos }))
        }
        Err(e) => {
            warn!("UTXO fetch failed for {}: {}", addr_str, e);
            Json(serde_json::json!({
                "utxos": [],
                "error": format!("wRPC error: {}", e)
            }))
        }
    }
}

/// GET /balance/:address - check balance
/// Supports ?network=... for correct chain when using the site toggle.
pub async fn balance_handler(
    Path(addr_str): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    Extension(_client): Extension<Arc<KaspaRpcClient>>,
) -> Json<serde_json::Value> {
    let addr = match Address::try_from(addr_str.as_str()) {
        Ok(a) => a,
        Err(e) => {
            return Json(
                serde_json::json!({"balance": 0, "error": format!("Invalid address: {}", e)}),
            );
        }
    };

    let net = params
        .get("network")
        .cloned()
        .unwrap_or_else(|| "testnet-12".to_string());
    let client: Arc<KaspaRpcClient> = match client_for_network(&net).await {
        Ok(c) => c,
        Err(e) => {
            return Json(
                serde_json::json!({"balance": 0, "error": format!("Failed to reach {} node: {}", net, e)}),
            );
        }
    };

    match client.get_balance_by_address(addr).await {
        Ok(balance) => Json(serde_json::json!({
            "balance": balance,
            "address": addr_str
        })),
        Err(e) => Json(serde_json::json!({
            "balance": 0,
            "error": format!("wRPC error: {}", e)
        })),
    }
}

pub fn broadcast_routes() -> Router {
    Router::new()
        .route("/broadcast", post(broadcast_handler))
        .route("/utxos/:address", get(utxos_handler))
        .route("/balance/:address", get(balance_handler))
}
