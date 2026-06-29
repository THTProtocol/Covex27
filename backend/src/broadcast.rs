use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
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
use std::time::Duration;
use tracing::{info, warn};
use workflow_serializer::prelude::BorshDeserialize;

/// Node connect timeout. A dead or unreachable wRPC endpoint must fail fast (503) instead of
/// hanging a request indefinitely; mirrors the time-bounding the crawler uses.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(6);
/// Per-RPC-call timeout. Bounds get_balance/get_utxos/submit so a stalled node returns 503.
const RPC_TIMEOUT: Duration = Duration::from_secs(8);

/// Pure wRPC-URL selection for a network (no I/O), so the routing decision can be unit-tested
/// without a live node. testnet-10 and mainnet each have a dedicated per-net env var with a
/// distinct local default; everything else (testnet-12 default) prefers the per-net var, then the
/// global KASPA_WRPC_URL the crawler uses, then a sane local default. is_mainnet routing means any
/// "mainnet*" network resolves to the mainnet endpoint. (Root cause this fixes for TN12: the old
/// 17217 default was dead; the live TN12 node is on 17219, reached via KASPA_WRPC_URL.)
fn wrpc_url_for_network(network: &str) -> String {
    if network == "testnet-10" {
        std::env::var("KASPA_WRPC_URL_TN10").unwrap_or_else(|_| "ws://127.0.0.1:17210".to_string())
    } else if crate::covenant_builder::is_mainnet(network) {
        std::env::var("KASPA_WRPC_URL_MAINNET")
            .unwrap_or_else(|_| "ws://127.0.0.1:17310".to_string())
    } else {
        std::env::var("KASPA_WRPC_URL_TN12")
            .or_else(|_| std::env::var("KASPA_WRPC_URL"))
            .unwrap_or_else(|_| "ws://127.0.0.1:17219".to_string())
    }
}

/// Resolve wRPC for network (on-demand, so /broadcast and balance checks target the chosen net).
/// connect() is time-bounded and the result is CHECKED via is_connected() (mirrors crawler.rs):
/// a node that is down or syncing returns a clear error instead of a silently-dead client whose
/// every RPC then hangs.
async fn client_for_network(network: &str) -> Result<Arc<KaspaRpcClient>, String> {
    let wrpc = wrpc_url_for_network(network);
    let c = kaspa_wrpc_client::KaspaRpcClient::new(
        kaspa_wrpc_client::WrpcEncoding::Borsh,
        Some(&wrpc),
        None,
        None,
        None,
    )
    .map_err(|e| format!("wRPC create failed for {}: {}", network, e))?;
    // Time-bound the connect: the default ConnectOptions block-and-retry would hang FOREVER if
    // the node is down. Mirrors the proven covenant_builder::client_for_network pattern (match
    // only the OUTER timeout; the inner connect result type is not destructured here).
    match tokio::time::timeout(CONNECT_TIMEOUT, c.connect(None)).await {
        Ok(inner) => {
            if let Err(e) = inner {
                return Err(format!("could not connect to {} node: {}", network, e));
            }
        }
        Err(_) => return Err(format!("timed out connecting to {} node", network)),
    }
    // Gate on is_connected() (mirrors crawler.rs). connect(None) uses the default ConnectOptions,
    // which BLOCK until the socket is established (that is the hang the timeout above bounds), so
    // by the time it returns Ok the connection is up; this catches the residual case where it
    // dropped immediately, surfacing a clear error rather than a dead client whose RPCs hang.
    if !c.is_connected() {
        return Err(format!(
            "{} node is not connected (down or syncing)",
            network
        ));
    }
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
    // Legacy/forward-compat wire fields: covenants are discovered natively on the DAG (see the
    // module note above), so the broadcast handler no longer reads these. Kept so older clients
    // that still send them are accepted (no deny_unknown_fields anywhere).
    #[allow(dead_code)]
    pub deployer_addr: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub script_hex: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub script_name: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
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
) -> axum::response::Response {
    let tx_hex = payload.tx_hex.trim();
    let net = &payload.network;

    let bad_request = |msg: String| {
        (
            StatusCode::OK,
            Json(serde_json::json!({ "success": false, "tx_id": null, "error": msg })),
        )
            .into_response()
    };

    // On-demand client so a broadcast POST with network=testnet-10 goes to the TN10 node.
    // A node that is down/unreachable returns 503 (a node outage, not a client error).
    let client: Arc<KaspaRpcClient> = match client_for_network(net).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "success": false,
                    "tx_id": null,
                    "error": format!("Failed to reach {} node for broadcast: {}", net, e)
                })),
            )
                .into_response();
        }
    };

    // Decode hex into bytes
    let tx_bytes = match hex::decode(tx_hex) {
        Ok(b) => b,
        Err(e) => return bad_request(format!("Invalid hex: {}", e)),
    };

    // Deserialize bytes -> consensus Transaction -> RpcTransaction
    let consensus_tx = match Transaction::try_from_slice(&tx_bytes) {
        Ok(tx) => tx,
        Err(e) => return bad_request(format!("Failed to parse transaction: {}", e)),
    };

    let rpc_tx: RpcTransaction = RpcTransaction::from(&consensus_tx);

    // Submit to node via wRPC - no DB writes, no auto-indexing. Time-bounded so a stalled node
    // returns 503 rather than hanging the request.
    match tokio::time::timeout(RPC_TIMEOUT, client.submit_transaction(rpc_tx, false)).await {
        Ok(Ok(tx_id)) => {
            let tx_id_str = tx_id.to_string();
            info!("Broadcast success: tx_id={}", tx_id_str);
            (
                StatusCode::OK,
                Json(serde_json::json!({ "success": true, "tx_id": tx_id_str, "error": null })),
            )
                .into_response()
        }
        Ok(Err(e)) => {
            warn!("Broadcast failed: {}", e);
            bad_request(format!("Broadcast rejected: {}", e))
        }
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "success": false,
                "tx_id": null,
                "error": format!("Timed out submitting to {} node", net)
            })),
        )
            .into_response(),
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
) -> axum::response::Response {
    let addr = match Address::try_from(addr_str.as_str()) {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::OK,
                Json(
                    serde_json::json!({ "utxos": [], "error": format!("Invalid address: {}", e) }),
                ),
            )
                .into_response();
        }
    };

    let net = params
        .get("network")
        .cloned()
        .unwrap_or_else(|| "testnet-12".to_string());
    let client: Arc<KaspaRpcClient> = match client_for_network(&net).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "utxos": [],
                    "error": format!("Failed to reach {} node: {}", net, e)
                })),
            )
                .into_response();
        }
    };

    match tokio::time::timeout(RPC_TIMEOUT, client.get_utxos_by_addresses(vec![addr])).await {
        Ok(Ok(entries)) => {
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
            (StatusCode::OK, Json(serde_json::json!({ "utxos": utxos }))).into_response()
        }
        Ok(Err(e)) => {
            warn!("UTXO fetch failed for {}: {}", addr_str, e);
            (
                StatusCode::OK,
                Json(serde_json::json!({ "utxos": [], "error": format!("wRPC error: {}", e) })),
            )
                .into_response()
        }
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "utxos": [],
                "error": format!("Timed out fetching UTXOs from {} node", net)
            })),
        )
            .into_response(),
    }
}

/// GET /balance/:address - check balance
/// Supports ?network=... for correct chain when using the site toggle.
pub async fn balance_handler(
    Path(addr_str): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    Extension(_client): Extension<Arc<KaspaRpcClient>>,
) -> axum::response::Response {
    let addr = match Address::try_from(addr_str.as_str()) {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::OK,
                Json(serde_json::json!({"balance": 0, "error": format!("Invalid address: {}", e)})),
            )
                .into_response();
        }
    };

    let net = params
        .get("network")
        .cloned()
        .unwrap_or_else(|| "testnet-12".to_string());
    let client: Arc<KaspaRpcClient> = match client_for_network(&net).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"balance": 0, "error": format!("Failed to reach {} node: {}", net, e)})),
            )
                .into_response();
        }
    };

    match tokio::time::timeout(RPC_TIMEOUT, client.get_balance_by_address(addr)).await {
        Ok(Ok(balance)) => (
            StatusCode::OK,
            Json(serde_json::json!({ "balance": balance, "address": addr_str })),
        )
            .into_response(),
        Ok(Err(e)) => (
            StatusCode::OK,
            Json(serde_json::json!({ "balance": 0, "error": format!("wRPC error: {}", e) })),
        )
            .into_response(),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "balance": 0,
                "error": format!("Timed out fetching balance from {} node", net)
            })),
        )
            .into_response(),
    }
}

pub fn broadcast_routes() -> Router {
    Router::new()
        .route("/broadcast", post(broadcast_handler))
        .route("/utxos/:address", get(utxos_handler))
        .route("/balance/:address", get(balance_handler))
}

#[cfg(test)]
mod tests {
    use super::*;

    // wrpc_url_for_network reads process-global env vars, so the env-sensitive cases must not run
    // concurrently with each other. Serialize them under one mutex and snapshot/restore every var
    // they touch so they leave the environment exactly as they found it.
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    struct EnvGuard {
        saved: Vec<(&'static str, Option<String>)>,
    }
    impl EnvGuard {
        fn capture(keys: &[&'static str]) -> Self {
            let saved = keys
                .iter()
                .map(|k| (*k, std::env::var(k).ok()))
                .collect();
            // Start from a known-clean slate so a value leaking in from the host or another test
            // cannot change the branch under test.
            for k in keys {
                std::env::remove_var(k);
            }
            EnvGuard { saved }
        }
    }
    impl Drop for EnvGuard {
        fn drop(&mut self) {
            for (k, v) in &self.saved {
                match v {
                    Some(val) => std::env::set_var(k, val),
                    None => std::env::remove_var(k),
                }
            }
        }
    }

    const ALL_WRPC_KEYS: &[&str] = &[
        "KASPA_WRPC_URL_TN10",
        "KASPA_WRPC_URL_MAINNET",
        "KASPA_WRPC_URL_TN12",
        "KASPA_WRPC_URL",
    ];

    /// default_network is the wire default applied when a BroadcastRequest omits `network`.
    #[test]
    fn default_network_is_testnet_12() {
        assert_eq!(default_network(), "testnet-12");
    }

    /// With no env overrides, each network resolves to its hardcoded local default, and the
    /// is_mainnet routing sends ANY "mainnet*" label (mainnet, mainnet-1) to the mainnet endpoint.
    #[test]
    fn url_selection_defaults_and_mainnet_routing() {
        let _lock = ENV_LOCK.lock().unwrap();
        let _g = EnvGuard::capture(ALL_WRPC_KEYS);

        assert_eq!(wrpc_url_for_network("testnet-10"), "ws://127.0.0.1:17210");
        // testnet-12 (and any other non-mainnet, non-TN10 label) falls to the TN12 default.
        assert_eq!(wrpc_url_for_network("testnet-12"), "ws://127.0.0.1:17219");
        assert_eq!(wrpc_url_for_network("anything-else"), "ws://127.0.0.1:17219");
        // is_mainnet is a starts_with("mainnet") check, so every mainnet variant routes to the
        // single mainnet endpoint (never a testnet one).
        assert_eq!(wrpc_url_for_network("mainnet"), "ws://127.0.0.1:17310");
        assert_eq!(wrpc_url_for_network("mainnet-1"), "ws://127.0.0.1:17310");
    }

    /// The per-network env var overrides the default for its own network only.
    #[test]
    fn url_selection_honors_per_net_overrides() {
        let _lock = ENV_LOCK.lock().unwrap();
        let _g = EnvGuard::capture(ALL_WRPC_KEYS);

        std::env::set_var("KASPA_WRPC_URL_TN10", "ws://tn10.example:1");
        std::env::set_var("KASPA_WRPC_URL_MAINNET", "ws://mainnet.example:2");
        std::env::set_var("KASPA_WRPC_URL_TN12", "ws://tn12.example:3");

        assert_eq!(wrpc_url_for_network("testnet-10"), "ws://tn10.example:1");
        assert_eq!(wrpc_url_for_network("mainnet"), "ws://mainnet.example:2");
        assert_eq!(wrpc_url_for_network("mainnet-1"), "ws://mainnet.example:2");
        assert_eq!(wrpc_url_for_network("testnet-12"), "ws://tn12.example:3");
    }

    /// For the testnet-12 (default) branch only, the precedence is: KASPA_WRPC_URL_TN12, then the
    /// global KASPA_WRPC_URL the crawler uses, then the local default. TN10/mainnet do NOT consult
    /// the global var.
    #[test]
    fn url_selection_tn12_precedence_chain() {
        let _lock = ENV_LOCK.lock().unwrap();
        let _g = EnvGuard::capture(ALL_WRPC_KEYS);

        // Only the global var set: TN12 falls through to it; TN10/mainnet ignore it.
        std::env::set_var("KASPA_WRPC_URL", "ws://global.example:9");
        assert_eq!(wrpc_url_for_network("testnet-12"), "ws://global.example:9");
        assert_eq!(wrpc_url_for_network("testnet-10"), "ws://127.0.0.1:17210");
        assert_eq!(wrpc_url_for_network("mainnet"), "ws://127.0.0.1:17310");

        // Per-net TN12 var wins over the global var when both are present.
        std::env::set_var("KASPA_WRPC_URL_TN12", "ws://tn12.example:3");
        assert_eq!(wrpc_url_for_network("testnet-12"), "ws://tn12.example:3");
    }

    /// The broadcast request shaping accepts legacy/forward-compat fields and applies the wire
    /// default for `network` when it is omitted (no deny_unknown_fields anywhere).
    #[test]
    fn broadcast_request_defaults_network_and_ignores_extra_fields() {
        let parsed: BroadcastRequest = serde_json::from_str(
            r#"{"tx_hex":"deadbeef","deployer_addr":"kaspatest:qabc","unknown_extra":123}"#,
        )
        .expect("legacy + unknown fields must still parse (no deny_unknown_fields)");
        assert_eq!(parsed.tx_hex, "deadbeef");
        assert_eq!(parsed.network, "testnet-12", "omitted network -> wire default");

        let parsed2: BroadcastRequest = serde_json::from_str(
            r#"{"tx_hex":"00","deployer_addr":"x","network":"testnet-10"}"#,
        )
        .expect("explicit network must parse");
        assert_eq!(parsed2.network, "testnet-10");
    }
}
