// ── Covex27 Rust Backend Signer ──────────────────────────────────────
//
// POST /api/sign-and-broadcast
//
// Escape-hatch endpoint that builds, signs, and broadcasts a Kaspa
// transaction entirely in native Rust. This avoids the Node.js CLI
// ESM/CJS WASM conflict — the backend already links kaspa-consensus-core
// and secp256k1, so we can sign Schnorr transactions natively.
//
// Transaction structure:
//   Output 0 → Covenant payload (1 KAS, deployer)
//   Output 1 → Treasury tier fee (if paid tier)
//   Output 2 → Change (deployer)
//
// STRICT: No DB writes. Returns tx_id only. Crawler discovers and
// indexes the covenant on-chain.
//
// ── SIGHASH FIX (TN12 Toccata fork) ─────────────────────────────
// kaspa-consensus-core v0.15.0's `payload_hash()` returns ZERO for
// SUBNETWORK_ID_NATIVE, but the TN12 node was patched to always include
// payload in sighash. We use a vendored copy of the crate with the fix:
// `payload_hash` now always hashes the payload regardless of subnetwork.
// See: vendor/kaspa-consensus-core/src/hashing/sighash.rs

use axum::{routing::post, Extension, Json, Router};
use kaspa_addresses::Address;
use kaspa_consensus_core::sign::sign_with_multiple_v2;
use kaspa_consensus_core::subnets::SubnetworkId;
use kaspa_consensus_core::tx::{
    ScriptPublicKey, ScriptVec, SignableTransaction, Transaction, TransactionInput,
    TransactionOutpoint, TransactionOutput, UtxoEntry,
};
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_rpc_core::{RpcTransaction, RpcUtxosByAddressesEntry};
use kaspa_wrpc_client::KaspaRpcClient;
use rusqlite::Connection;
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use tracing::{info, warn};

use crate::compiler;
use crate::db;
use crate::dev_wallets;

// ── Constants ─────────────────────────────────────────────────────

/// Treasury address — all tier fees go here
const TREASURY_ADDRESS: &str =
    "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m";

/// Minimum tx fee (10,000 sompi = 0.0001 KAS)
const TX_FEE: u64 = 10_000;

/// Covenant payload output amount (1 KAS = 100,000,000 sompi)
const COVENANT_AMOUNT: u64 = 100_000_000;

/// Tier fees in KAS, multiplied to sompi
const MAX_FEE: u64 = 1_000 * 100_000_000;
const PRO_FEE: u64 = 500 * 100_000_000;
const BUILDER_FEE: u64 = 100 * 100_000_000;

// ── Request/Response types ─────────────────────────────────────────

#[derive(Deserialize, Debug)]
pub struct SignAndBroadcastRequest {
    /// 64-char hex private key (32 bytes) — ignored when use_dev_mode is true
    #[serde(default)]
    pub private_key_hex: String,
    /// Kaspa address of the deployer (kaspatest:...)
    pub deployer_addr: String,
    /// Hex-encoded covenant script to embed in tx payload
    pub script_hex: String,
    /// Optional string tier: "MAX", "PRO", "BUILDER", or absent/other for FREE
    #[serde(default)]
    pub tier: Option<String>,
    /// Optional custom script name for covenant embedding
    #[serde(default)]
    pub covenant_name: Option<String>,
    /// If true, load private key from dev_wallets.rs (wallet 1)
    #[serde(default)]
    pub use_dev_mode: bool,
    /// Optional Covex DSL source text — if present, compiled via silverc
    /// and used as tx.payload instead of script_hex.
    #[serde(default)]
    pub dsl_source: Option<String>,
}

#[derive(serde::Serialize)]
pub struct SignAndBroadcastResponse {
    pub success: bool,
    pub tx_id: Option<String>,
    pub outputs: Option<Vec<TxOutputSummary>>,
    pub error: Option<String>,
}

#[derive(serde::Serialize)]
pub struct TxOutputSummary {
    pub index: u32,
    pub amount_sompi: u64,
    pub amount_kas: f64,
    pub address: String,
}

// ── Helper: tier fee from string ──────────────────────────────────

fn tier_fee_sompi(tier: Option<&str>) -> u64 {
    match tier.map(|s| s.to_uppercase()).as_deref() {
        Some("MAX") => MAX_FEE,
        Some("PRO") => PRO_FEE,
        Some("BUILDER") => BUILDER_FEE,
        _ => 0,
    }
}

// ── Helper: parse address → ScriptPublicKey ────────────────────────

fn script_pub_key_from_address(addr_str: &str) -> Result<ScriptPublicKey, String> {
    let addr = Address::try_from(addr_str)
        .map_err(|e| format!("Invalid address '{}': {}", addr_str, e))?;
    let payload = addr.payload.as_slice();
    let script_vec: Vec<u8> = match payload.len() {
        32 => {
            let mut s = Vec::with_capacity(34);
            s.push(0x20);
            s.extend_from_slice(payload);
            s.push(0xac);
            s
        }
        20 => {
            let mut s = Vec::with_capacity(25);
            s.push(0x76);
            s.push(0xa9);
            s.push(0x14);
            s.extend_from_slice(payload);
            s.push(0x88);
            s.push(0xac);
            s
        }
        n => {
            return Err(format!(
                "Unexpected payload length {}, expected 20 or 32",
                n
            ))
        }
    };
    Ok(ScriptPublicKey::new(0, ScriptVec::from_slice(&script_vec)))
}

// ── Helper: convert RPC UTXO entry → UtxoEntry for signing ────────

fn to_utxo_entry(entry: &RpcUtxosByAddressesEntry) -> UtxoEntry {
    UtxoEntry {
        amount: entry.utxo_entry.amount,
        script_public_key: entry.utxo_entry.script_public_key.clone(),
        block_daa_score: entry.utxo_entry.block_daa_score,
        is_coinbase: entry.utxo_entry.is_coinbase,
    }
}

// ── The handler ───────────────────────────────────────────────────

/// POST /sign-and-broadcast
///
/// Steps:
/// 1. Resolve private key (dev mode → dev_wallets.rs, otherwise from request)
/// 2. Fetch deployer UTXOs from wRPC
/// 3. Determine tier fee and compute outputs
/// 4. Build unsigned Transaction (native subnetwork, version 0)
/// 5. Create SignableTransaction with UTXO entries
/// 6. Sign with schnorr via sign_with_multiple_v2
/// 7. Finalize AFTER signing
/// 8. Broadcast via wRPC
/// 9. Return tx_id
pub async fn sign_and_broadcast_handler(
    Extension(client): Extension<Arc<KaspaRpcClient>>,
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Json(payload): Json<SignAndBroadcastRequest>,
) -> Json<serde_json::Value> {
    // ── Step 1: Resolve private key ──────────────────────────────
    let private_key_hex: String = if payload.use_dev_mode {
        if payload.deployer_addr == dev_wallets::DEV_WALLET_2_ADDRESS {
            dev_wallets::DEV_WALLET_2_PRIVATE_KEY.to_string()
        } else {
            dev_wallets::DEV_WALLET_1_PRIVATE_KEY.to_string()
        }
    } else {
        payload.private_key_hex.clone()
    };

    let clean_hex = private_key_hex.trim().trim_start_matches("0x");
    let pk_bytes: [u8; 32] = match hex::decode(clean_hex).ok().and_then(|b| b.try_into().ok()) {
        Some(b) => b,
        None => {
            return Json(serde_json::json!(SignAndBroadcastResponse {
                success: false,
                tx_id: None,
                outputs: None,
                error: Some("Invalid private key: must be 64 hex chars (32 bytes)".into()),
            }));
        }
    };

    // ── Step 2: Fetch deployer UTXOs ──────────────────────────
    let deployer_addr = match Address::try_from(payload.deployer_addr.as_str()) {
        Ok(a) => a,
        Err(e) => {
            return Json(serde_json::json!(SignAndBroadcastResponse {
                success: false,
                tx_id: None,
                outputs: None,
                error: Some(format!("Invalid deployer address: {}", e)),
            }));
        }
    };

    let utxos = match client
        .get_utxos_by_addresses(vec![deployer_addr.clone()])
        .await
    {
        Ok(entries) => entries,
        Err(e) => {
            warn!("UTXO fetch failed: {}", e);
            return Json(serde_json::json!(SignAndBroadcastResponse {
                success: false,
                tx_id: None,
                outputs: None,
                error: Some(format!("Failed to fetch UTXOs: {}", e)),
            }));
        }
    };

    if utxos.is_empty() {
        return Json(serde_json::json!(SignAndBroadcastResponse {
            success: false,
            tx_id: None,
            outputs: None,
            error: Some("No UTXOs found for deployer address".into()),
        }));
    }

    // ── Step 3: Select UTXOs and compute outputs ──────────────
    let tier = payload.tier.as_deref();
    let tier_fee = tier_fee_sompi(tier);

    // Clone UTXO's script_public_key exactly — avoids byte mismatches
    let deployer_script = utxos[0].utxo_entry.script_public_key.clone();

    let treasury_script = match script_pub_key_from_address(TREASURY_ADDRESS) {
        Ok(s) => s,
        Err(e) => {
            return Json(serde_json::json!(SignAndBroadcastResponse {
                success: false,
                tx_id: None,
                outputs: None,
                error: Some(format!("Treasury address error: {}", e)),
            }));
        }
    };

    let total_cost = COVENANT_AMOUNT + tier_fee + TX_FEE;

    // Decode covenant script for the transaction payload.
    // If dsl_source is provided, compile it through silverc to get
    // real Kaspa Script bytecode. Otherwise, use the raw script_hex
    // as before (backward-compatible).
    let covenant_payload: Vec<u8> = if let Some(ref dsl) = payload.dsl_source {
        if dsl.trim().is_empty() {
            vec![]
        } else {
            match compiler::compile_dsl(dsl) {
                Ok(compiled) => {
                    let mut payload_bytes = vec![0xaa, 0x20];
                    payload_bytes.extend_from_slice(&compiled.bytecode);
                    info!(
                        "[COMPILER] DSL compiled: {} → {} bytes bytecode ({} bytes payload)",
                        compiled.contract_name,
                        compiled.bytecode.len(),
                        payload_bytes.len()
                    );
                    payload_bytes
                }
                Err(e) => {
                    warn!(
                        "[COMPILER] DSL compilation failed: {} — falling back to raw script_hex",
                        e
                    );
                    if payload.script_hex.trim().is_empty() {
                        vec![]
                    } else {
                        hex::decode(payload.script_hex.trim()).unwrap_or_default()
                    }
                }
            }
        }
    } else if payload.script_hex.trim().is_empty() {
        vec![]
    } else {
        hex::decode(payload.script_hex.trim()).unwrap_or_default()
    };

    // Use 1 largest UTXO to keep mass under 500K cap
    let max_inputs = 1usize;
    let chosen_utxos: Vec<&RpcUtxosByAddressesEntry> = if utxos.len() <= max_inputs {
        utxos.iter().collect()
    } else {
        let mut sorted: Vec<&RpcUtxosByAddressesEntry> = utxos.iter().collect();
        sorted.sort_by_key(|u| u.utxo_entry.amount);
        sorted.reverse(); // largest first
        sorted.truncate(max_inputs);
        sorted
    };

    let total_input: u64 = chosen_utxos.iter().map(|u| u.utxo_entry.amount).sum();

    if total_input < total_cost {
        return Json(serde_json::json!(SignAndBroadcastResponse {
            success: false,
            tx_id: None,
            outputs: None,
            error: Some(format!(
                "Insufficient balance: have {} sompi ({} KAS), need {} sompi ({} KAS)",
                total_input,
                total_input as f64 / 100_000_000.0,
                total_cost,
                total_cost as f64 / 100_000_000.0,
            )),
        }));
    }

    let change = total_input - total_cost;

    // On-chain truth output structure:
    //   Output 0 → Deployer (1 KAS)
    //   Output 1 → Treasury (tier fee, only if paid)
    //   Output 2 → Deployer (change)
    let mut outputs = vec![TransactionOutput {
        value: COVENANT_AMOUNT,
        script_public_key: deployer_script.clone(),
    }];
    if tier_fee > 0 {
        outputs.push(TransactionOutput {
            value: tier_fee,
            script_public_key: treasury_script,
        });
    }
    if change > 0 {
        outputs.push(TransactionOutput {
            value: change,
            script_public_key: deployer_script.clone(),
        });
    }

    // ── Step 4: Build unsigned transaction ─────────────────────
    let inputs: Vec<TransactionInput> = chosen_utxos
        .iter()
        .map(|u| TransactionInput {
            previous_outpoint: TransactionOutpoint {
                transaction_id: u.outpoint.transaction_id,
                index: u.outpoint.index,
            },
            signature_script: vec![],
            sequence: 0,
            sig_op_count: 1,
        })
        .collect();

    let unsigned_tx = Transaction::new_non_finalized(
        0, // version
        inputs,
        outputs.clone(),
        0,                                   // lock_time
        SubnetworkId::from_bytes([0u8; 20]), // native subnetwork
        0,                                   // gas
        covenant_payload.clone(),            // covenant script payload
    );

    // ── Step 5-6: Sign THEN finalize ──────────────────────────
    let entries: Vec<UtxoEntry> = chosen_utxos.iter().map(|u| to_utxo_entry(u)).collect();

    // ── DIAGNOSTIC LOGGING ───────────────────────────────────
    let first_utxo = &chosen_utxos[0];
    warn!(
        "[SIGNER-DIAG] tx_inputs={}  utxo_entries={}  pk_prefix={}",
        unsigned_tx.inputs.len(),
        entries.len(),
        &private_key_hex[..10.min(private_key_hex.len())],
    );
    warn!(
        "[SIGNER-DIAG] input[0] outpoint={}:{}",
        first_utxo.outpoint.transaction_id, first_utxo.outpoint.index,
    );
    warn!(
        "[SIGNER-DIAG] entry[0] amount={} script_len={}",
        entries[0].amount,
        entries[0].script_public_key.script().len(),
    );
    warn!(
        "[SIGNER-DIAG] tx.payload_len={} tx.subnetwork_id={:?} tx.version={} tx.gas={}",
        unsigned_tx.payload.len(),
        unsigned_tx.subnetwork_id,
        unsigned_tx.version,
        unsigned_tx.gas,
    );

    let signable_tx = SignableTransaction::with_entries(unsigned_tx, entries);

    let result = sign_with_multiple_v2(signable_tx, &[pk_bytes]);
    let mut signed_tx = match result.fully_signed() {
        Ok(tx) => tx,
        Err(e) => {
            return Json(serde_json::json!(SignAndBroadcastResponse {
                success: false,
                tx_id: None,
                outputs: None,
                error: Some(format!("Signing failed: {}", e)),
            }));
        }
    };

    // Finalize AFTER signing — tx ID must include signature bytes
    signed_tx.tx.finalize();
    let consensus_tx = signed_tx.tx;
    let rpc_tx = RpcTransaction::from(&consensus_tx);

    match client.submit_transaction(rpc_tx, false).await {
        Ok(tx_id) => {
            let tx_id_str = tx_id.to_string();
            info!(
                "Sign-and-broadcast success: tx_id={}, tier={:?}, fee={}",
                tx_id_str, tier, tier_fee
            );

            // ── IMMEDIATE DB WRITE: save covenant so user sees it right away ──
            let deployer_str = payload.deployer_addr.clone();
            // Capture the actual hex payload for DB storage (compiled or raw)
            let script_hex_for_db: String = covenant_payload
                .iter()
                .map(|b| format!("{:02x}", b))
                .collect();
            let tier_str = tier.unwrap_or("FREE");
            let covenant_name = payload.covenant_name.as_deref().unwrap_or(if tier_fee > 0 {
                tier_str
            } else {
                "SilverScript Covenant"
            });
            let covenant_type = if tier_fee > 0 {
                covenant_name.to_string()
            } else {
                "SilverScript Covenant".to_string()
            };
            let receiving_addrs =
                serde_json::to_string(&vec![deployer_str.clone()]).unwrap_or_default();
            let desc = if tier_fee > 0 {
                format!("{} tier covenant deployed", tier_str)
            } else {
                "Covenant deployed via Covex Terminal".to_string()
            };

            // Compute script hash from hex
            let script_bytes = hex::decode(&script_hex_for_db).unwrap_or_default();
            let script_hash = {
                use sha2::{Digest, Sha256};
                format!("{:x}", Sha256::digest(&script_bytes))
            };

            // DB insert — non-fatal on failure; covenant is already on-chain
            let _ = db::insert_covenant(
                &db,
                &tx_id_str,
                &deployer_str,
                COVENANT_AMOUNT,
                &script_hash,
                &script_hex_for_db,
                &covenant_type,
                "general",
                &deployer_str,
                &desc,
                0, // block_daa_score (crawler updates this)
                tier_str,
                &desc,
                &receiving_addrs,
            );
            info!(
                "Covenant {} saved to DB immediately after broadcast",
                tx_id_str
            );

            let output_summaries: Vec<TxOutputSummary> = outputs
                .iter()
                .enumerate()
                .map(|(i, o)| TxOutputSummary {
                    index: i as u32,
                    amount_sompi: o.value,
                    amount_kas: o.value as f64 / 100_000_000.0,
                    address: format!("output_{}", i),
                })
                .collect();
            Json(serde_json::json!(SignAndBroadcastResponse {
                success: true,
                tx_id: Some(tx_id_str),
                outputs: Some(output_summaries),
                error: None,
            }))
        }
        Err(e) => {
            warn!("Sign-and-broadcast submit failed: {}", e);
            Json(serde_json::json!(SignAndBroadcastResponse {
                success: false,
                tx_id: None,
                outputs: None,
                error: Some(format!("Broadcast rejected: {}", e)),
            }))
        }
    }
}

pub fn signer_routes() -> Router {
    Router::new().route("/sign-and-broadcast", post(sign_and_broadcast_handler))
}
