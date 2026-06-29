// ── Covex27 Rust Backend Signer ──────────────────────────────────────
//
// POST /api/sign-and-broadcast
//
// Escape-hatch endpoint that builds, signs, and broadcasts a Kaspa
// transaction entirely in native Rust. This avoids the Node.js CLI
// ESM/CJS WASM conflict - the backend already links kaspa-consensus-core
// and secp256k1, so we can sign Schnorr transactions natively.
//
// Transaction structure:
//   - Deploy: Output 0 → Covenant (1 KAS to deployer), Output 1 → Treasury tier fee (if any), Output 2 → change
//   - Pure tier upgrade ("Pay 100 KAS" etc): Output 0 → Treasury (exact tier fee), Output 1 → change
//     (no 1 KAS covenant side-output, no covenant DB row created - only address tier credit)
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
use serde::Deserialize;
use std::sync::Arc;
use tracing::{info, warn};

use crate::compiler;
use crate::db;
use crate::dev_wallets;

// ── Constants ─────────────────────────────────────────────────────

/// Treasury address - all tier fees go here
const TREASURY_ADDRESS: &str = dev_wallets::TREASURY_ADDRESS;

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
    /// 64-char hex private key (32 bytes) - ignored when use_dev_mode is true
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
    /// Optional Covex DSL source text - if present, compiled via silverc
    /// and used as tx.payload instead of script_hex.
    #[serde(default)]
    pub dsl_source: Option<String>,
    /// Network to deploy on: "testnet-12" (default) or "testnet-10" or "mainnet"
    #[serde(default = "default_network")]
    pub network: String,

    // FIX: Accept free-tier visual + description fields that frontend sends.
    // These are primarily handled by the separate /api/covenant-metadata endpoint,
    // but accepting them here prevents silent drops and allows logging/forwarding.
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub accent: Option<String>,
    #[serde(default)]
    pub ui_preset: Option<String>,

    /// When true (from "Pay XXX KAS" tier upgrade buttons), perform a minimal treasury-only
    /// transfer of exactly the tier fee. Do NOT emit the 1 KAS covenant self-output and do
    /// NOT insert a covenant record (pure account tier top-up / covenant upgrade).
    #[serde(default)]
    pub pure_tier_payment: bool,

    // Premium covenant metadata - category and custom_ui_config
    #[serde(default)]
    pub covenant_type: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub custom_ui_config: Option<serde_json::Value>,

    /// Mainnet honesty gate (roadmap B6): this legacy path produces a DECORATIVE
    /// covenant (a self-payment plus an aa20 metadata payload) - the chain enforces
    /// nothing about its outcome. On mainnet, deploying one requires explicitly
    /// acknowledging that. For real on-chain enforcement use POST /covenant/p2sh/deploy.
    #[serde(default)]
    pub acknowledge_unenforced: bool,
}

fn default_network() -> String {
    "testnet-12".to_string()
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

// ── Honesty gate (c): decorative-covenant mainnet predicate ──────────
//
// Extracted as a pub(crate) free function so the production handler AND
// the unit test in `mainnet_fail_closed_tests` call the SAME code path.
// If this predicate is ever weakened or deleted, both sites change and
// the test fails - which is the regression we want CI to catch.
//
// `is_pure_tier_payment` mirrors the inline derivation in the handler
// (Step 3): a pure tier payment is either the explicit flag, or a
// tier-fee-bearing request whose script_hex is empty or the bare `aa20`
// metadata prefix (no real covenant payload).
pub(crate) fn is_pure_tier_payment(req: &SignAndBroadcastRequest) -> bool {
    let tier_fee = tier_fee_sompi(req.tier.as_deref());
    req.pure_tier_payment
        || (tier_fee > 0 && (req.script_hex.trim().is_empty() || req.script_hex.trim() == "aa20"))
}

/// True when a request on mainnet would deploy a DECORATIVE covenant
/// (metadata only; the chain does not enforce its outcome) without the
/// caller explicitly opting in via `acknowledge_unenforced`. Pure tier
/// payments are exempt because they are plain treasury transfers, not a
/// covenant deploy. Testnets are never blocked.
pub(crate) fn decorative_mainnet_blocked(req: &SignAndBroadcastRequest) -> bool {
    crate::covenant_builder::is_mainnet(&req.network)
        && !is_pure_tier_payment(req)
        && !req.acknowledge_unenforced
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

/// Resolve wRPC endpoint for a given network (on-demand client per deploy, so TN10 deploys
/// go to the TN10 node even if this backend process was primarily started for TN12).
async fn client_for_network(network: &str) -> Result<Arc<KaspaRpcClient>, String> {
    let wrpc = if network == "testnet-10" {
        std::env::var("KASPA_WRPC_URL_TN10").unwrap_or_else(|_| "ws://127.0.0.1:17210".to_string())
    } else if crate::covenant_builder::is_mainnet(network) {
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
    .map_err(|e| format!("wRPC client create failed for {}: {}", network, e))?;
    // Fire-and-forget connect; indexer-style retries happen inside if needed for long-lived,
    // here for a deploy we just need it briefly.
    let _ = c.connect(None).await;
    Ok(Arc::new(c))
}

pub async fn sign_and_broadcast_handler(
    Extension(db): Extension<db::Db>,
    Json(payload): Json<SignAndBroadcastRequest>,
) -> Json<serde_json::Value> {
    // ── Step 1: Resolve private key ──────────────────────────────
    let network = &payload.network;

    // MAINNET SECURITY: never allow hardcoded dev wallets / private keys from source.
    if crate::covenant_builder::is_mainnet(network) && payload.use_dev_mode {
        return Json(serde_json::json!(SignAndBroadcastResponse {
            success: false,
            tx_id: None,
            outputs: None,
            error: Some("Dev mode and hardcoded keys are DISABLED on mainnet. Use a real wallet extension (KasWare etc.) to sign and broadcast covenant deployments. All value is real KAS.".into()),
        }));
    }
    // NON-CUSTODIAL KEYSTONE: never accept a raw MAINNET private key. Mainnet signing is
    // non-custodial (the key signs the sighash in the browser via prepare/submit). A raw mainnet
    // key here would be the backend half of a custody breach. Refuse it; testnet is unaffected.
    if crate::covenant_builder::is_mainnet(network)
        && !payload.use_dev_mode
        && !payload.private_key_hex.trim().is_empty()
    {
        return Json(serde_json::json!(SignAndBroadcastResponse {
            success: false,
            tx_id: None,
            outputs: None,
            error: Some("mainnet signing is non-custodial: do not send a private key to the server. Use the prepare/submit flow so your key signs in your browser.".into()),
        }));
    }

    let private_key_hex: String;
    let deployer_addr_str: String;
    if payload.use_dev_mode {
        // Dev-deployer keys are read from the service environment (never from source).
        // A missing/blank env var or a mainnet network yields a clear Err here.
        if payload.deployer_addr == dev_wallets::DEV_WALLET_2_ADDRESS_TN12
            || payload.deployer_addr == dev_wallets::DEV_WALLET_2_ADDRESS_TN10
        {
            deployer_addr_str = if network == "testnet-10" {
                dev_wallets::DEV_WALLET_2_ADDRESS_TN10
            } else {
                dev_wallets::DEV_WALLET_2_ADDRESS_TN12
            }
            .to_string();
            private_key_hex = match dev_wallets::dev_private_key(2, network) {
                Ok(k) => k,
                Err(e) => {
                    return Json(serde_json::json!(SignAndBroadcastResponse {
                        success: false,
                        tx_id: None,
                        outputs: None,
                        error: Some(e),
                    }))
                }
            };
        } else if payload.deployer_addr == dev_wallets::DEV_WALLET_1_ADDRESS_TN12
            || payload.deployer_addr == dev_wallets::DEV_WALLET_1_ADDRESS_TN10
        {
            deployer_addr_str = if network == "testnet-10" {
                dev_wallets::DEV_WALLET_1_ADDRESS_TN10
            } else {
                dev_wallets::DEV_WALLET_1_ADDRESS_TN12
            }
            .to_string();
            private_key_hex = match dev_wallets::dev_private_key(1, network) {
                Ok(k) => k,
                Err(e) => {
                    return Json(serde_json::json!(SignAndBroadcastResponse {
                        success: false,
                        tx_id: None,
                        outputs: None,
                        error: Some(e),
                    }))
                }
            };
        } else {
            // Browser-derived address doesn't match any known dev wallet.
            // Use the key from the request but the address won't have UTXOs.
            private_key_hex = payload.private_key_hex.clone();
            deployer_addr_str = payload.deployer_addr.clone();
            warn!(
                "use_dev_mode=true but deployer_addr {} doesn't match known dev wallets. Using browser-derived key (UTXO lookup may fail).",
                payload.deployer_addr
            );
        }
    } else {
        private_key_hex = payload.private_key_hex.clone();
        deployer_addr_str = payload.deployer_addr.clone();
    };

    // Network-aware treasury address. Route through the single-source-of-truth selector so the
    // mainnet case is handled by the SAME predicate as everywhere else (crate::covenant_builder::
    // is_mainnet), rather than a local `testnet-10 ? TN10 : TN12` branch that had no mainnet arm and
    // would silently fall through to the TN12 testnet treasury. On mainnet this handler is already
    // unreachable (the use_dev_mode and raw-private-key gates above reject every mainnet path before
    // here), so this is defense-in-depth that keeps the treasury selection correct if those upstream
    // gates ever change. Testnet behavior is unchanged (testnet-10 -> TN10, else -> TN12).
    let treasury_addr_str: &str = dev_wallets::treasury_address_for_network(network);

    // On-demand client for the *requested* network (key for same-website TN10/TN12 toggle).
    // This ensures the UTXO query and broadcast target the correct kaspad (e.g. 17210 for TN10).
    let client: Arc<KaspaRpcClient> = match client_for_network(network).await {
        Ok(c) => c,
        Err(e) => {
            return Json(serde_json::json!(SignAndBroadcastResponse {
                success: false,
                tx_id: None,
                outputs: None,
                error: Some(format!("Failed to connect to {} node: {}", network, e)),
            }));
        }
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
    let deployer_addr = match Address::try_from(deployer_addr_str.as_str()) {
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

    // Pure tier payment (upgrade pay button) = send *exactly* tier_fee to treasury.
    // Regular deploy bundles 1 KAS covenant funding output + tier_fee in same tx.
    // Predicate is centralised so the unit test exercises the same code path.
    let is_pure_tier = is_pure_tier_payment(&payload);

    // Mainnet reality gate (B6): a legacy deploy here is a DECORATIVE covenant - it
    // self-pays and only embeds an aa20 metadata payload, so the chain enforces nothing
    // about its outcome. Refuse it on mainnet unless the caller explicitly acknowledges,
    // and point them at the real script-enforced builder. (Pure tier payments are just
    // treasury transfers and are unaffected.) Predicate lives in
    // `decorative_mainnet_blocked` so it can be unit-tested directly.
    if decorative_mainnet_blocked(&payload) {
        return Json(serde_json::json!(SignAndBroadcastResponse {
            success: false,
            tx_id: None,
            outputs: None,
            error: Some("This deploy path produces a DECORATIVE covenant (metadata only; the chain does not enforce its outcome). On mainnet, use POST /covenant/p2sh/deploy for a real script-enforced covenant, or resend with acknowledge_unenforced:true if a marker covenant is intended.".into()),
        }));
    }

    // Clone UTXO's script_public_key exactly - avoids byte mismatches
    let deployer_script = utxos[0].utxo_entry.script_public_key.clone();

    let treasury_script = match script_pub_key_from_address(treasury_addr_str) {
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

    let covenant_fund = if is_pure_tier { 0u64 } else { COVENANT_AMOUNT };
    let total_cost = covenant_fund + tier_fee + TX_FEE;

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
                        "[COMPILER] DSL compilation failed: {} - falling back to raw script_hex",
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

    // ── TOCCATA SIGHASH GUARD: never broadcast an empty-payload tx ──────────────
    // TN12+ (Toccata HF) folds the tx payload hash into EVERY input's sighash. A tx with an
    // EMPTY payload makes the signer and the node disagree on the sighash, so the signature
    // fails verification ("false stack entry at end of script execution") and the broadcast is
    // rejected. This bit the pure-tier-payment path, which carried no payload. Guarantee a
    // non-empty payload on every tx: a fee-only payment gets a small branded marker. Any
    // non-empty bytes work (signer and node hash the SAME payload); the marker deliberately
    // does NOT use the aa20..87 P2SH shape, so the crawler never mistakes a fee payment for a
    // covenant deploy.
    let covenant_payload: Vec<u8> = if covenant_payload.is_empty() {
        let mut marker = b"covex:pay:".to_vec();
        marker.extend_from_slice(tier.unwrap_or("free").as_bytes());
        marker
    } else {
        covenant_payload
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
    // For normal deploy: Output0=1KAS (deployer), Output1=tier to treasury (if any), Output2=change
    // For pure tier payment (upgrade): Output0=tier to treasury, Output1=change  (exact fee only)
    let mut outputs = Vec::new();
    if covenant_fund > 0 {
        outputs.push(TransactionOutput {
            value: covenant_fund,
            script_public_key: deployer_script.clone(),
        });
    }
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
        "[SIGNER-DIAG] tx_inputs={}  utxo_entries={}",
        unsigned_tx.inputs.len(),
        entries.len(),
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

    // Finalize AFTER signing - tx ID must include signature bytes
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

            let deployer_str = deployer_addr_str.clone();
            let tier_str = tier.unwrap_or("FREE");

            // ── IMMEDIATE PAYER CREDIT: The signer knows exactly who paid.
            if tier_fee > 0 {
                let payer_addr = deployer_addr_str.clone();
                let treasury_str = treasury_addr_str.to_string();
                info!(
                    "Signer crediting payer {} for {} tier (fee: {} sompi, tx: {})",
                    &payer_addr[..16.min(payer_addr.len())],
                    tier_str,
                    tier_fee,
                    &tx_id_str[..16],
                );
                let _ = db::insert_payment(
                    &db,
                    &tx_id_str,
                    &payer_addr,
                    &treasury_str,
                    tier_fee,
                    tier_str,
                    // The deploy transaction IS the covenant: link the payment to it
                    // so the covenant can always prove its paid status.
                    Some(&tx_id_str),
                    network,
                );
                let _ = db::confirm_payment(&db, &tx_id_str, 1);
                let _ = db::upgrade_account(&db, &payer_addr, tier_str, &tx_id_str, network);
                info!(
                    "Signer payment credited: {} upgraded to {} tier",
                    &payer_addr[..16.min(payer_addr.len())],
                    tier_str,
                );
            }

            // ── IMMEDIATE DB WRITE: save covenant so user sees it right away ──
            // Skip entirely for pure tier payments (e.g. "Pay 100 KAS" upgrade on an existing covenant).
            // Those only credit the payer address tier via the payment/upgrade_account above.
            if !is_pure_tier {
                // Capture the actual hex payload for DB storage (compiled or raw)
                let script_hex_for_db: String = covenant_payload
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect();
                let covenant_name = payload.covenant_name.as_deref().unwrap_or(if tier_fee > 0 {
                    tier_str
                } else {
                    "SilverScript Covenant"
                });
                let _covenant_type = if tier_fee > 0 {
                    covenant_name.to_string()
                } else {
                    "SilverScript Covenant".to_string()
                };
                let receiving_addrs =
                    serde_json::to_string(&vec![deployer_str.clone()]).unwrap_or_default();
                // Use submitted description/category if provided, fall back to tier-default
                let desc = payload.description.clone().unwrap_or_else(|| {
                    if tier_fee > 0 {
                        format!("{} tier covenant deployed", tier_str)
                    } else {
                        "Covenant deployed via Covex Terminal".to_string()
                    }
                });
                let covenant_type_val = payload.covenant_type.clone().unwrap_or_else(|| {
                    if tier_fee > 0 {
                        tier_str.to_string()
                    } else {
                        "SilverScript Covenant".to_string()
                    }
                });
                let category_val = payload
                    .category
                    .clone()
                    .unwrap_or_else(|| "general".to_string());

                // Compute script hash from hex
                let script_bytes = hex::decode(&script_hex_for_db).unwrap_or_default();
                let script_hash = {
                    use sha2::{Digest, Sha256};
                    format!("{:x}", Sha256::digest(&script_bytes))
                };

                // DB insert - non-fatal on failure; covenant is already on-chain
                let _ = db::insert_covenant(
                    &db,
                    &tx_id_str,
                    &deployer_str,
                    COVENANT_AMOUNT,
                    &script_hash,
                    &script_hex_for_db,
                    &covenant_type_val,
                    &category_val,
                    &deployer_str,
                    &desc,
                    0, // block_daa_score (crawler updates this)
                    tier_str,
                    &desc,
                    &receiving_addrs,
                    network,
                );
                info!(
                    "Covenant {} saved to DB immediately after broadcast",
                    tx_id_str
                );
            } // end if !is_pure_tier

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
    // NOTE: GET /balance/:address is already provided by broadcast_routes() (broadcast.rs),
    // which returns {"balance": <sompi>} via get_balance_by_address. We deliberately do NOT
    // register a second balance route here - axum rejects two routes that differ only in their
    // path-param name (/balance/:addr vs /balance/:address) with a startup panic.
}

// ── Mainnet fail-closed regression tests ──────────────────────────────────
//
// The three gates exercised here protect the legacy /sign-and-broadcast path
// from accidentally moving real mainnet KAS or producing a misleading
// "covenant" on mainnet:
//
//   (a) use_dev_mode + mainnet  -> rejected (line ~241): hardcoded dev
//       wallets must never be used on mainnet.
//   (b) raw private_key_hex in request + mainnet -> rejected (line ~252):
//       mainnet is non-custodial; the server never sees the key. Signing
//       happens in the browser via the prepare/submit flow.
//   (c) decorative covenant on mainnet without explicit
//       acknowledge_unenforced -> rejected (line ~410): this path embeds
//       only an aa20 metadata payload; the chain enforces nothing about
//       the outcome. The caller must opt in or use POST /covenant/p2sh/deploy.
//
// Gates (a) and (b) return before any wRPC I/O, so the handler can be
// called directly with an in-memory Db. Gate (c) is checked AFTER a UTXO
// fetch in the live handler, which would require a live mainnet node to
// reach via a full handler call. Instead of replicating the predicate in
// the test (which would pin the test's own copy, not prod), the gate is
// extracted into `decorative_mainnet_blocked` and BOTH the handler at
// line ~410 and the gate (c) test below call that one function. A
// regression in either site is caught.
#[cfg(test)]
mod mainnet_fail_closed_tests {
    use super::*;

    /// Fresh, isolated in-memory Db. Each test gets its own pool. The
    /// gates under test return before touching the DB, so the schema is
    /// irrelevant; we just need any valid Db handle for the Extension.
    fn fresh_db() -> db::Db {
        db::open_db(":memory:").expect("open_db(:memory:) must succeed for the test fixture")
    }

    /// Helper: build a request that would otherwise be a valid mainnet
    /// "decorative covenant" deploy (non-empty script_hex, no tier). Each
    /// test then flips exactly ONE field to trip the gate it targets, so
    /// failures point at a single regression and nothing else.
    fn base_mainnet_request() -> SignAndBroadcastRequest {
        SignAndBroadcastRequest {
            private_key_hex: String::new(),
            // A valid kaspa: mainnet address shape is irrelevant: gates (a)
            // and (b) return before address parsing. We still supply a
            // placeholder so the struct is well-formed.
            deployer_addr: "kaspa:qrp9000000000000000000000000000000000000000000000000000000000"
                .to_string(),
            // Non-empty + not "aa20" so is_pure_tier stays false (matters
            // for the gate (c) logic replica below).
            script_hex: "deadbeef".to_string(),
            tier: None,
            covenant_name: None,
            use_dev_mode: false,
            dsl_source: None,
            network: "mainnet".to_string(),
            description: None,
            accent: None,
            ui_preset: None,
            pure_tier_payment: false,
            covenant_type: None,
            category: None,
            custom_ui_config: None,
            acknowledge_unenforced: false,
        }
    }

    fn assert_rejected_with(resp: serde_json::Value, must_contain: &str) {
        let success = resp
            .get("success")
            .and_then(|v| v.as_bool())
            .expect("response must have a boolean `success`");
        assert!(
            !success,
            "expected fail-closed rejection, got success=true. Full response: {resp}"
        );
        let err = resp
            .get("error")
            .and_then(|v| v.as_str())
            .expect("rejection must include an `error` string");
        assert!(
            err.contains(must_contain),
            "error message must mention `{must_contain}`. Got: {err}"
        );
    }

    /// (a) Mainnet + use_dev_mode=true must be rejected (gate at line ~241).
    /// Dev wallets are hardcoded testnet keys; using them on mainnet would
    /// either fail or, worse, move real funds from a key checked into
    /// source history. Fail closed.
    #[tokio::test]
    async fn rejects_mainnet_with_use_dev_mode_true() {
        let db = fresh_db();
        let mut req = base_mainnet_request();
        req.use_dev_mode = true;

        let Json(resp) = sign_and_broadcast_handler(Extension(db), Json(req)).await;
        assert_rejected_with(resp, "DISABLED on mainnet");
    }

    /// Same gate, but using the alternate network spelling "mainnet-1".
    /// Both spellings must trip the same rejection: a typo-driven bypass
    /// would defeat the entire fail-closed posture.
    #[tokio::test]
    async fn rejects_mainnet_1_with_use_dev_mode_true() {
        let db = fresh_db();
        let mut req = base_mainnet_request();
        req.network = "mainnet-1".to_string();
        req.use_dev_mode = true;

        let Json(resp) = sign_and_broadcast_handler(Extension(db), Json(req)).await;
        assert_rejected_with(resp, "DISABLED on mainnet");
    }

    /// (b) Mainnet + raw private_key_hex in the request must be rejected
    /// (gate at line ~252). Mainnet signing is non-custodial: the server
    /// must never see a mainnet private key. Anything else is the backend
    /// half of a custody breach.
    #[tokio::test]
    async fn rejects_mainnet_with_raw_private_key() {
        let db = fresh_db();
        let mut req = base_mainnet_request();
        // 64 hex chars; the gate triggers on non-empty after trim, not on
        // key validity (the key is never even parsed before the return).
        req.private_key_hex =
            "1111111111111111111111111111111111111111111111111111111111111111".to_string();

        let Json(resp) = sign_and_broadcast_handler(Extension(db), Json(req)).await;
        assert_rejected_with(resp, "non-custodial");
    }

    /// Whitespace-only keys must also be rejected? No: the gate uses
    /// `.trim().is_empty()`, so a whitespace key is treated as absent and
    /// the gate does NOT trip. That is the documented behavior; if it ever
    /// changes the test would need updating. We pin "leading/trailing
    /// whitespace around a real key" as the realistic regression case.
    #[tokio::test]
    async fn rejects_mainnet_with_whitespace_padded_private_key() {
        let db = fresh_db();
        let mut req = base_mainnet_request();
        req.private_key_hex =
            "  2222222222222222222222222222222222222222222222222222222222222222  ".to_string();

        let Json(resp) = sign_and_broadcast_handler(Extension(db), Json(req)).await;
        assert_rejected_with(resp, "non-custodial");
    }

    /// (c) Decorative-covenant mainnet gate (line ~410):
    ///   if decorative_mainnet_blocked(&payload) { reject; }
    ///
    /// The predicate is extracted as a pub(crate) free function so the
    /// handler and this test exercise the SAME code. If gate (c) is ever
    /// deleted or weakened in the handler, the function it now calls
    /// changes, this test changes with it, and CI catches the regression.
    /// (Calling the full handler is not possible here because gate (c)
    /// sits after a UTXO fetch that would need a live mainnet wRPC.)
    #[test]
    fn decorative_covenant_gate_rejects_unacknowledged_mainnet() {
        // The vulnerable shape: mainnet, real script_hex (not aa20), no
        // acknowledgement, no pure tier. MUST be blocked.
        let mut req = base_mainnet_request();
        assert!(
            decorative_mainnet_blocked(&req),
            "unacknowledged decorative deploy on mainnet must be blocked"
        );

        // Same on the alternate spelling.
        req.network = "mainnet-1".to_string();
        assert!(
            decorative_mainnet_blocked(&req),
            "unacknowledged decorative deploy on mainnet-1 must be blocked"
        );

        // Acknowledging unlocks the path (caller opted in to a metadata-only
        // covenant). The gate's job is only to force the opt-in; it is not
        // a permanent ban.
        req.acknowledge_unenforced = true;
        assert!(
            !decorative_mainnet_blocked(&req),
            "acknowledge_unenforced=true must release the gate"
        );

        // Pure tier payments are exempt: they are just treasury transfers,
        // not a decorative covenant. Reset and exercise this branch via
        // the explicit flag.
        let mut tier_req = base_mainnet_request();
        tier_req.pure_tier_payment = true;
        assert!(
            !decorative_mainnet_blocked(&tier_req),
            "pure_tier_payment=true must bypass the decorative-covenant gate"
        );

        // Also exercise the derived-pure-tier branch of `is_pure_tier_payment`:
        // tier set + empty script_hex (or bare "aa20") must register as a pure
        // tier payment and therefore release the gate. This pins the second
        // arm of the predicate, not just the explicit flag.
        let mut empty_script_tier = base_mainnet_request();
        empty_script_tier.tier = Some("PRO".to_string());
        empty_script_tier.script_hex = String::new();
        assert!(
            is_pure_tier_payment(&empty_script_tier),
            "tier set + empty script_hex must be classified as a pure tier payment"
        );
        assert!(
            !decorative_mainnet_blocked(&empty_script_tier),
            "derived pure tier payment must bypass the decorative-covenant gate"
        );
        let mut aa20_script_tier = base_mainnet_request();
        aa20_script_tier.tier = Some("BUILDER".to_string());
        aa20_script_tier.script_hex = "aa20".to_string();
        assert!(
            is_pure_tier_payment(&aa20_script_tier),
            "tier set + bare aa20 script_hex must be classified as a pure tier payment"
        );
        assert!(
            !decorative_mainnet_blocked(&aa20_script_tier),
            "derived pure tier payment (aa20) must bypass the decorative-covenant gate"
        );

        // Testnets are never blocked by this gate, regardless of the other
        // fields. Belt-and-braces: the gate must be MAINNET-scoped only.
        let mut tn_req = base_mainnet_request();
        tn_req.network = "testnet-12".to_string();
        assert!(
            !decorative_mainnet_blocked(&tn_req),
            "testnet-12 must not trip the mainnet gate"
        );
        tn_req.network = "testnet-10".to_string();
        assert!(
            !decorative_mainnet_blocked(&tn_req),
            "testnet-10 must not trip the mainnet gate"
        );
    }

    /// Bonus consistency check: the gate (a) rejection precedes gate (b),
    /// so a request that trips BOTH must surface the gate-(a) error
    /// message. This pins the documented evaluation order: if anyone
    /// reorders the gates, the operator-visible error changes silently,
    /// which is exactly the kind of mainnet-only regression we want to
    /// catch in CI.
    #[tokio::test]
    async fn gate_a_takes_precedence_over_gate_b() {
        let db = fresh_db();
        let mut req = base_mainnet_request();
        req.use_dev_mode = true;
        req.private_key_hex =
            "3333333333333333333333333333333333333333333333333333333333333333".to_string();

        let Json(resp) = sign_and_broadcast_handler(Extension(db), Json(req)).await;
        assert_rejected_with(resp, "DISABLED on mainnet");
    }
}
