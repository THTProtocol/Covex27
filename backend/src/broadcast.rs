use crate::db;
use crate::covenant_types;
use axum::{extract::Path, Extension, Json, Router, routing::{get, post}};
use kaspa_addresses::Address;
use kaspa_consensus_core::tx::Transaction;
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_rpc_core::RpcTransaction;
use kaspa_wrpc_client::KaspaRpcClient;
use serde::Deserialize;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::{info, warn, error};
use workflow_serializer::prelude::BorshDeserialize;

// ── TX broadcast endpoint ────────────────────────────────────────

#[derive(Deserialize, Debug)]
pub struct BroadcastRequest {
    pub tx_hex: String,
    pub deployer_addr: String,
    pub script_hex: String,
    pub script_name: Option<String>,
}

/// POST /broadcast — accepts a signed Kaspa transaction hex, parses, broadcasts via wRPC
pub async fn broadcast_handler(
    Extension(client): Extension<Arc<KaspaRpcClient>>,
    Extension(db): Extension<Arc<Mutex<rusqlite::Connection>>>,
    Json(payload): Json<BroadcastRequest>,
) -> Json<serde_json::Value> {
    let tx_hex = payload.tx_hex.trim();

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

    // Submit to node via wRPC
    match client.submit_transaction(rpc_tx, false).await {
        Ok(tx_id) => {
            let tx_id_str = tx_id.to_string();
            let tx_id_for_response = tx_id_str.clone();
            info!("Broadcast success: tx_id={}", tx_id_str);

            // Auto-index the deployed covenant
            let script_hex = payload.script_hex.clone();
            let deployer = payload.deployer_addr.clone();
            let script_name = payload.script_name.clone();
            if !script_hex.is_empty() {
                let db2 = Arc::clone(&db);
                tokio::spawn(async move {
                    let category = covenant_types::CovenantCategory::from_script_ops(&script_hex);
                    let script_hash = crate::compute_script_hash(&script_hex);
                    let covenant_type = if script_hex.starts_with("aa20") {
                        "p2sh-covenant"
                    } else {
                        "silverscript-covenant"
                    };
                    let amount = 100_000_000u64; // 1 KAS

                    if let Err(e) = db::insert_covenant(
                        &db2,
                        &tx_id_str,
                        &deployer,
                        amount,
                        &script_hash,
                        &script_hex,
                        covenant_type,
                        category.label(),
                        &deployer,
                        "Deployed via Covex Dev Wallet",
                        0,
                    ) {
                        error!("Failed to auto-index deployed covenant {}: {}", tx_id_str, e);
                        return;
                    }
                    info!("Auto-indexed deployed covenant: {} (type: {})", &tx_id_str[..16], covenant_type);

                    // Auto-generate basic UI
                    let params = crate::ui_generator::extract_parameters_from_script("aa20", &script_hash);
                    let config = crate::covenant_types::UiGenerationConfig {
                        covenant_id: tx_id_str.clone(),
                        covenant_name: script_name.unwrap_or_else(|| {
                            format!("{} {}", covenant_type, &tx_id_str[..8])
                        }),
                        category: category.label().to_string(),
                        script_hash,
                        parameters: params,
                        is_enhanced: false,
                        disclosure_level: "limited".into(),
                        creator_addr: deployer,
                    };
                    let ui_html = crate::ui_generator::generate_basic_ui(&config);
                    let slug = format!("covenant-{}", &tx_id_str[..16]);
                    let _ = db::save_generated_ui(&db2, &tx_id_str, &tx_id_str, "FREE", &ui_html, "{}", &slug, false);
                    let _ = db::set_visibility(&db2, &tx_id_str, "FREE", false, 0, None);
                    info!("Auto-generated basic UI for deployed covenant {}", &tx_id_str[..16]);
                });
            }

            Json(serde_json::json!({
                "success": true,
                "tx_id": tx_id_for_response,
                "error": null
            }))
        }
        Err(e) => {
            error!("Broadcast failed: {}", e);
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

/// GET /utxos/:address — fetch UTXOs for a Kaspa address from the wRPC node
pub async fn utxos_handler(
    Path(addr_str): Path<String>,
    Extension(client): Extension<Arc<KaspaRpcClient>>,
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

    match client.get_utxos_by_addresses(vec![addr]).await {
        Ok(entries) => {
            let utxos: Vec<UtxoEntry> = entries
                .into_iter()
                .map(|entry| {
                    let tx_id = entry.outpoint.transaction_id.to_string();
                    let index = entry.outpoint.index;
                    let amount = entry.utxo_entry.amount;
                    let script_hex = hex::encode(entry.utxo_entry.script_public_key.script());
                    UtxoEntry { tx_id, index, amount, script_hex }
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

/// GET /balance/:address — check balance
pub async fn balance_handler(
    Path(addr_str): Path<String>,
    Extension(client): Extension<Arc<KaspaRpcClient>>,
) -> Json<serde_json::Value> {
    let addr = match Address::try_from(addr_str.as_str()) {
        Ok(a) => a,
        Err(e) => {
            return Json(serde_json::json!({"balance": 0, "error": format!("Invalid address: {}", e)}));
        }
    };

    match client.get_balance_by_address(addr).await {
        Ok(balance) => {
            Json(serde_json::json!({
                "balance": balance,
                "address": addr_str
            }))
        }
        Err(e) => {
            Json(serde_json::json!({
                "balance": 0,
                "error": format!("wRPC error: {}", e)
            }))
        }
    }
}

pub fn broadcast_routes() -> Router {
    Router::new()
        .route("/broadcast", post(broadcast_handler))
        .route("/utxos/:address", get(utxos_handler))
        .route("/balance/:address", get(balance_handler))
}
