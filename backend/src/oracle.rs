// oracle.rs - Covex Oracle Verification & Signing Service (Phase 2)
//
// POST /api/oracle/verify-and-sign
//
// Accepts a ZK proof for a supported circuit type, verifies it via snarkjs,
// and if valid, returns a Schnorr-style signature over (covenant_id, outcome, timestamp)
// signed by the Covex oracle key (DEV_WALLET_1 in testnet).
//
// Supported circuits (Phase 12):
//   - merkle_membership: Fully production Groth16 + oracle
//   - range_proof:       Fully wired to snarkjs verifier (zk/verify_range.js).
//   (chess_v1 removed)
//                        proving_mode (0=Hybrid fast with witnessed candidates/attacks, 1=Full ZK stronger) is committed in public signals.
//                        Falls back to oracle attestation with requested_outcome if no (valid) Groth16 proof body.
//   - tictactoe_v1, connect4_v1, timelock_absolute, hash_preimage: Groth16 + oracle fallback.

use axum::{
    extract::Extension,
    extract::Json,
    routing::{get, post},
    Router,
};
use secp256k1::{schnorr::Signature, Keypair, Message, Secp256k1};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::process::Command;
use tracing::info;

use crate::oracle_verifier::{
    circuit_requires_crypto_proof, determine_outcome_for_circuit, verify_proof_for_circuit,
};

/// Input to the oracle verification endpoint.
#[derive(Deserialize)]
pub struct OracleVerifyInput {
    pub covenant_id: String,
    #[serde(default = "default_circuit_type")]
    pub circuit_type: String, // "merkle_membership" | "range_proof" | "chess_v1" (oracle attestation for game results)
    pub proof: serde_json::Value, // The Groth16 proof object
    #[serde(default)]
    pub public_inputs: Vec<String>, // Public signals (rootHash, etc.) - default empty for attested/hybrid/simulate paths
    #[serde(default)]
    pub requested_outcome: Option<u32>, // Claimed outcome (0-1 for binary)

    // Chess (and other games) proving mode support (0=Hybrid fast, 1=Full ZK stronger security).
    // Bound in the proof public signals for chess_v1 when the mode is used.
    // The oracle verifies the Groth16 proof the same way; the mode is surfaced for metadata / policy.
    #[serde(default)]
    pub proving_mode: Option<u32>,

    // Phase 15: Multi-Oracle Federation support
    #[serde(default)]
    pub multi_oracle: Option<MultiOracleInput>,

    // Sprint 2/3: Optional simulate for decentralized_liveness (e.g. "partial" or "down") to easily test
    // covenant logic with outage scenarios without changing the stub. Keeps full compatibility.
    #[serde(default)]
    pub simulate: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct MultiOracleInput {
    pub providers: Vec<MultiOracleProvider>,
    pub threshold: u32,
    /// List of signatures. Each signature must include which public key it was signed for.
    pub signatures: Vec<MultiOracleSignature>,
}

#[derive(Deserialize, Debug)]
pub struct MultiOracleProvider {
    pub name: String,
    pub public_key: String, // hex of the oracle's public/secret key material used for signing
    #[serde(default)]
    pub weight: u32,
}

#[derive(Deserialize, Debug)]
pub struct MultiOracleSignature {
    pub public_key: String, // which provider this signature is for
    pub signature: String,  // the hex signature
}

fn default_circuit_type() -> String {
    "merkle_membership".to_string()
}

/// Output from the oracle verification endpoint.
#[derive(Serialize)]
pub struct OracleVerifyOutput {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<u32>, // 0 = proven (claimant wins), 1 = rejected (depositor wins)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>, // Oracle signature over outcome
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>, // The signed message for verification
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub public_inputs: Vec<String>,
    // Covenant-friendly extras (added for easy ZK+oracle integration into SilverScript covenants)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub circuit_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub covenant_hint: Option<String>,
}

/// Build the oracle routes.
pub fn oracle_routes() -> Router {
    Router::new()
        .route("/oracle/verify-and-sign", post(verify_and_sign_handler))
        .route("/oracle/liveness", get(oracle_liveness_handler))
        .route("/oracle/pubkey", get(oracle_pubkey_handler))
}

/// GET /oracle/pubkey : the oracle's verifiable identity + signing scheme, so
/// anyone (and a Toccata covenant unlock) can verify outcome signatures.
async fn oracle_pubkey_handler() -> Json<serde_json::Value> {
    Json(json!({
        "scheme": "bip340-schnorr-secp256k1",
        "xonly_pubkey": oracle_xonly_pubkey_hex(),
        "message_format": "covex-oracle:{covenant_id}:{outcome}:{timestamp}",
        "digest": "sha256(message)",
        "note": "Verify the oracle's outcome signature (BIP340) against this x-only key."
    }))
}

/// Placeholder ONLY - this is NOT a usable signing key. The oracle's real signing
/// key MUST be supplied at runtime via the `COVEX_ORACLE_KEY` env var (64-hex / 32
/// bytes). If the env var is unset the oracle fails closed (refuses to sign) rather
/// than silently signing with a secret baked into source / git history.
///
/// The previous value here was the rotated, *compromised* dev-wallet-1 private key;
/// it was removed 2026-06-16 for source hygiene (it had been committed to git
/// history). Note the on-chain identity is `sha256(key)` -> secp256k1 (see
/// `oracle_keypair`), so an environment that wants to reproduce the prior testnet
/// oracle identity (for existing TN10/TN12 oracle_enforced / oracle_escrow covenants)
/// can set `COVEX_ORACLE_KEY` to the old value as an env secret - never in source.
const ORACLE_KEY_PLACEHOLDER: &str = "SET_COVEX_ORACLE_KEY__no_oracle_key_is_baked_into_source";

/// Returns the oracle signing key from `COVEX_ORACLE_KEY`. Fails closed: there is no
/// compiled-in default, so an unset / empty / placeholder value panics rather than
/// signing with a non-secret key. (Panicking aborts only the offending request task,
/// not the whole server - observability endpoints degrade gracefully; see main.rs.)
fn oracle_key_bytes() -> Vec<u8> {
    let raw = match std::env::var("COVEX_ORACLE_KEY") {
        Ok(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => panic!(
            "COVEX_ORACLE_KEY is not set: the oracle refuses to sign with a key baked \
             into source (fail-closed). The old compiled-in testnet default was the \
             rotated/compromised dev-wallet-1 key and was removed 2026-06-16. Set \
             COVEX_ORACLE_KEY=<64-hex> in this environment (a throwaway value is fine \
             for local testnet; use the old value to keep existing TN10/TN12 covenants)."
        ),
    };
    if raw == ORACLE_KEY_PLACEHOLDER {
        panic!(
            "COVEX_ORACLE_KEY is set to the placeholder sentinel - refusing to sign with \
             a non-secret value. Provide a real 64-hex oracle key."
        );
    }
    hex::decode(&raw).expect("COVEX_ORACLE_KEY must be valid hex (64 hex chars / 32 bytes)")
}

/// Public version for use by the claim/payout handler in main.rs
pub fn oracle_key_bytes_public() -> Vec<u8> {
    oracle_key_bytes()
}

// ── Real BIP340 Schnorr oracle signatures ───────────────────────────────────
// The oracle attests an outcome by signing `covex-oracle:{id}:{outcome}:{ts}`
// with a secp256k1 key. This is a REAL elliptic-curve signature (not the old
// SHA256(key||msg) keyed hash, which no Kaspa opcode could ever verify): a
// covenant unlock can check it on-chain via OpCheckSig at Toccata, and any
// third party can verify it against the published x-only public key.

/// Derive the oracle's secp256k1 keypair from the configured key. We hash the
/// configured bytes so ANY COVEX_ORACLE_KEY value maps to a valid secp256k1
/// scalar; the oracle's identity (its public key) is deterministic from the
/// configured secret.
pub(crate) fn oracle_keypair() -> Keypair {
    let seed = Sha256::digest(oracle_key_bytes());
    Keypair::from_seckey_slice(&Secp256k1::new(), seed.as_slice())
        .expect("hashed oracle key is a valid secp256k1 scalar")
}

/// The oracle's BIP340 x-only public key (32-byte hex) - its verifiable identity.
pub fn oracle_xonly_pubkey_hex() -> String {
    let (xonly, _parity) = oracle_keypair().x_only_public_key();
    hex::encode(xonly.serialize())
}

/// The oracle's x-only public key as raw bytes - used as a multisig member in an
/// oracle-enforced covenant (a 2-of-2 P2SH of [oracle, winner]), so the chain itself
/// requires the disclosed oracle's co-signature to release funds (roadmap D1).
pub(crate) fn oracle_xonly_pubkey_bytes() -> [u8; 32] {
    oracle_keypair().x_only_public_key().0.serialize()
}

fn message_digest(message: &str) -> Message {
    let d: [u8; 32] = Sha256::digest(message.as_bytes()).into();
    Message::from_digest(d)
}

// ── H4: covenant_id -> BN254 field element ──────────────────────────────────
// The BN254 (alt_bn128 / bn128) scalar field modulus `r` that snarkjs/circom use.
// Public signals are field elements in [0, r). We bind a covenant by committing
// sha256(covenant_id) reduced mod r as a public input. Implemented with plain
// 256-bit big-endian byte arithmetic (compare / subtract / div-by-10) so it needs
// NO new bignum crate dependency.
const BN254_R_BE: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// big-endian 256-bit compare: a >= b ?
fn be_ge(a: &[u8; 32], b: &[u8; 32]) -> bool {
    for i in 0..32 {
        if a[i] != b[i] {
            return a[i] > b[i];
        }
    }
    true
}

/// big-endian 256-bit subtract in place: a -= b (assumes a >= b).
fn be_sub_assign(a: &mut [u8; 32], b: &[u8; 32]) {
    let mut borrow: i16 = 0;
    for i in (0..32).rev() {
        let diff = a[i] as i16 - b[i] as i16 - borrow;
        if diff < 0 {
            a[i] = (diff + 256) as u8;
            borrow = 1;
        } else {
            a[i] = diff as u8;
            borrow = 0;
        }
    }
}

/// Render a big-endian 256-bit value as a base-10 string (repeated div by 10).
fn be_to_decimal(mut v: [u8; 32]) -> String {
    // Fast path for zero.
    if v.iter().all(|&x| x == 0) {
        return "0".to_string();
    }
    let mut digits: Vec<u8> = Vec::with_capacity(78);
    while v.iter().any(|&x| x != 0) {
        let mut rem: u32 = 0;
        for byte in v.iter_mut() {
            let cur = (rem << 8) | (*byte as u32);
            *byte = (cur / 10) as u8;
            rem = cur % 10;
        }
        digits.push(b'0' + rem as u8);
    }
    digits.reverse();
    String::from_utf8(digits).expect("ascii digits")
}

/// Compute the field element that binds a covenant: sha256(covenant_id) interpreted
/// big-endian, reduced mod the BN254 scalar field, as a decimal string (matching how
/// snarkjs emits public signals). A circuit binds itself to a covenant by committing
/// this value as a public input.
pub(crate) fn covenant_field_element(covenant_id: &str) -> String {
    let mut acc: [u8; 32] = Sha256::digest(covenant_id.as_bytes()).into();
    // sha256 output < 2^256 < 5*r, so a few conditional subtractions fully reduce it.
    while be_ge(&acc, &BN254_R_BE) {
        be_sub_assign(&mut acc, &BN254_R_BE);
    }
    be_to_decimal(acc)
}

/// H4: the strict circuits recompiled to emit a `covenantId` public signal (= covenant_field_element
/// of the covenant_id) whose in-browser provers now commit it. For these, a missing binding is a
/// hard reject (cross-covenant replay or a stale pre-H4 proof). Kept in sync with the recompiled set
/// in zk/ and frontend VERIFIED_FULL_ZK. utxo_ownership is the catalog alias for basic_utxo_ownership.
pub(crate) fn circuit_emits_covenant_binding(circuit_type: &str) -> bool {
    matches!(
        circuit_type,
        "merkle_membership"
            | "age_verification"
            | "escrow_2party"
            | "range_proof"
            | "vrf_dice_roll"
            | "nullifier_set"
            | "basic_utxo_ownership"
            | "utxo_ownership"
            | "hash_preimage"
            | "timelock_absolute"
            | "relative_timelock"
            | "vrf_random"
            | "turn_timer"
            | "script_constraint"
            | "pot_split_math"
            // New privacy / identity / solvency circuits: each emits covenantId as a public signal,
            // and their provers commit covenant_field_element(covenant_id). Their node-verify matrix
            // confirmed a proof bound to covenant A is REJECTED for covenant B, so a missing binding
            // here is a hard reject (no cross-covenant replay).
            | "commitment_open"
            | "balance_threshold"
            | "solvency_sum"
            | "set_non_membership"
            | "anon_membership_nullifier"
    )
}

/// Sign sha256(message) with the oracle key (BIP340 Schnorr; 64-byte hex sig).
pub fn sign_outcome(message: &str) -> String {
    let kp = oracle_keypair();
    let sig = Secp256k1::new().sign_schnorr_no_aux_rand(&message_digest(message), &kp);
    hex::encode(sig.as_ref())
}

/// Verify a BIP340 Schnorr signature over sha256(message) against the oracle key.
pub fn verify_outcome(message: &str, sig_hex: &str) -> bool {
    let (xonly, _parity) = oracle_keypair().x_only_public_key();
    let sig_bytes = match hex::decode(sig_hex.trim_start_matches("0x")) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let sig = match Signature::from_slice(&sig_bytes) {
        Ok(s) => s,
        Err(_) => return false,
    };
    Secp256k1::verification_only()
        .verify_schnorr(&sig, &message_digest(message), &xonly)
        .is_ok()
}

/// Path to the snarkjs verify.js script (for merkle).
fn verify_script_path() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../zk/verify.js");
    path
}

/// Path to the range proof verifier (Phase 12).
fn verify_range_script_path() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../zk/verify_range.js");
    path
}

fn verify_tictactoe_script_path() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../zk/verify_tictactoe.js");
    path
}

fn verify_connect4_script_path() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../zk/verify_connect4.js");
    path
}

fn verify_timelock_script_path() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../zk/verify_timelock.js");
    path
}

fn verify_hash_preimage_script_path() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../zk/verify_hash_preimage.js");
    path
}

fn verify_privacy_mixer_script_path() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../zk/verify_privacy_mixer.js");
    path
}

fn node_binary() -> &'static str {
    if std::path::Path::new("/usr/bin/node").exists() {
        "/usr/bin/node"
    } else if std::path::Path::new("/root/.nvm/versions/node/v20.20.2/bin/node").exists() {
        "/root/.nvm/versions/node/v20.20.2/bin/node"
    } else {
        "node"
    }
}

fn run_zk_verifier(
    script: PathBuf,
    tmp_prefix: &str,
    proof: &serde_json::Value,
    public_inputs: &[String],
) -> Result<bool, String> {
    let proof_json = serde_json::json!({
        "proof": proof,
        "publicSignals": public_inputs,
    });
    let tmp_path =
        std::env::temp_dir().join(format!("{}_{}.json", tmp_prefix, uuid::Uuid::new_v4()));
    std::fs::write(
        &tmp_path,
        serde_json::to_string(&proof_json).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Failed to write temp proof: {}", e))?;

    let output = Command::new(node_binary())
        .arg(script.to_str().unwrap_or("zk/verify.js"))
        .arg(&tmp_path)
        .output()
        .map_err(|e| format!("Failed to run verifier: {}", e))?;

    let _ = std::fs::remove_file(&tmp_path);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!(
            "Verifier failed: {} {}",
            stdout.trim(),
            stderr.trim()
        ));
    }

    let result: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Invalid verifier output: {}", e))?;

    match result["valid"].as_bool() {
        Some(v) => Ok(v),
        None => Err(format!("Unexpected verifier output: {}", result)),
    }
}

async fn run_zk_verifier_async(
    script: PathBuf,
    tmp_prefix: &'static str,
    proof: serde_json::Value,
    public_inputs: Vec<String>,
) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || run_zk_verifier(script, tmp_prefix, &proof, &public_inputs))
        .await
        .map_err(|e| format!("Spawn blocking failed: {}", e))?
}

/// Verify a MerkleMembership Groth16 proof via snarkjs.
/// Runs the Node.js verifier in a blocking task to avoid stalling the async runtime.
fn verify_merkle_proof(
    proof: &serde_json::Value,
    public_inputs: &[String],
) -> Result<bool, String> {
    let proof_json = serde_json::json!({
        "proof": proof,
        "publicSignals": public_inputs,
    });
    let tmp_path = std::env::temp_dir().join(format!("covex_oracle_{}.json", uuid::Uuid::new_v4()));
    std::fs::write(
        &tmp_path,
        serde_json::to_string(&proof_json).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Failed to write temp proof: {}", e))?;

    let script = verify_script_path();
    let node_binary = if std::path::Path::new("/usr/bin/node").exists() {
        "/usr/bin/node"
    } else if std::path::Path::new("/root/.nvm/versions/node/v20.20.2/bin/node").exists() {
        "/root/.nvm/versions/node/v20.20.2/bin/node"
    } else {
        "node"
    };

    // Run verification synchronously - this is fine because the handler
    // wraps us in tokio::task::spawn_blocking.
    let output = Command::new(node_binary.to_string())
        .arg(script.to_str().unwrap_or("zk/verify.js"))
        .arg(&tmp_path)
        .output()
        .map_err(|e| {
            format!(
                "Failed to run snarkjs verifier (node={}): {}",
                node_binary, e
            )
        })?;

    // Cleanup
    let _ = std::fs::remove_file(&tmp_path);

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!(
            "Verifier exited with status {}: stdout={} stderr={}",
            output.status,
            stdout.trim(),
            stderr.trim()
        ));
    }

    if stdout.trim().is_empty() {
        return Err(format!(
            "Verifier produced no output. stderr: {}",
            stderr.trim()
        ));
    }

    let result: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Invalid verifier output '{}': {}", stdout.trim(), e))?;

    match result["valid"].as_bool() {
        Some(true) => Ok(true),
        Some(false) => Ok(false),
        None => Err(format!(
            "Unexpected verifier output: {}",
            serde_json::to_string(&result).unwrap_or_default()
        )),
    }
}

/// Verify a Range Proof via snarkjs (Phase 12).
/// Uses zk/verify_range.js + range_proof_vkey.json when available.
fn verify_range_proof(proof: &serde_json::Value, public_inputs: &[String]) -> Result<bool, String> {
    let proof_json = serde_json::json!({
        "proof": proof,
        "publicSignals": public_inputs,
    });
    let tmp_path = std::env::temp_dir().join(format!("covex_range_{}.json", uuid::Uuid::new_v4()));
    std::fs::write(
        &tmp_path,
        serde_json::to_string(&proof_json).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Failed to write temp proof: {}", e))?;

    let script = verify_range_script_path();
    let node_binary = if std::path::Path::new("/usr/bin/node").exists() {
        "/usr/bin/node"
    } else if std::path::Path::new("/root/.nvm/versions/node/v20.20.2/bin/node").exists() {
        "/root/.nvm/versions/node/v20.20.2/bin/node"
    } else {
        "node"
    };

    let output = Command::new(node_binary.to_string())
        .arg(script.to_str().unwrap_or("zk/verify_range.js"))
        .arg(&tmp_path)
        .output()
        .map_err(|e| format!("Failed to run range verifier: {}", e))?;

    let _ = std::fs::remove_file(&tmp_path);

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!(
            "Range verifier failed: {} {}",
            stdout.trim(),
            stderr.trim()
        ));
    }

    let result: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Invalid range verifier output: {}", e))?;

    match result["valid"].as_bool() {
        Some(true) => Ok(true),
        Some(false) => Ok(false),
        None => Err(format!("Unexpected range verifier response: {}", stdout)),
    }
}

/// Async wrapper around verify_merkle_proof for use in axum handlers.
async fn verify_merkle_proof_async(
    proof: serde_json::Value,
    public_inputs: Vec<String>,
) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || verify_merkle_proof(&proof, &public_inputs))
        .await
        .map_err(|e| format!("Spawn blocking failed: {}", e))?
}

/// Async wrapper for Range Proof verification (Phase 12).
/// Now calls the real snarkjs verifier when artifacts exist.
async fn verify_range_proof_async(
    proof: serde_json::Value,
    public_inputs: Vec<String>,
) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || verify_range_proof(&proof, &public_inputs))
        .await
        .map_err(|e| format!("Spawn blocking failed: {}", e))?
}

// chess_v1 support removed (circuit deleted per request)

/// Handle POST /api/oracle/verify-and-sign
async fn verify_and_sign_handler(
    Extension(db): Extension<crate::db::Db>,
    Json(input): Json<OracleVerifyInput>,
) -> Json<OracleVerifyOutput> {
    let timestamp = chrono::Utc::now().timestamp();

    // Privacy mixer: reject spent nullifiers before ZK verify
    if input.circuit_type == "privacy_mixer_v1" {
        if let Some(nullifier) = input.public_inputs.get(2) {
            if crate::db::mixer_nullifier_spent(&db, nullifier).unwrap_or(false) {
                return Json(OracleVerifyOutput {
                    success: false,
                    outcome: None,
                    signature: None,
                    timestamp: None,
                    message: None,
                    error: Some("Nullifier already spent - double-withdraw rejected".to_string()),
                    public_inputs: input.public_inputs,
                    circuit_type: None,
                    covenant_hint: None,
                });
            }
        }
    }

    // === Phase 3 decentralized oracle comment block ===
    // - New GET /api/oracle/liveness (implemented above using spawn_blocking + stubs in zk/)
    //   returns {liveness:true, operators:3, threshold:2, note:'Phase 3 multi-oracle stub'}
    // - POST with circuit_type=decentralized_liveness or onchain_sig_verify :
    //   Explicitly documented here: they are treated as Attested (or Risc0 if prefixed) via
    //   the pluggable registry in oracle_verifier.rs (see decentralized_oracle, onchain_sig_verify_stub,
    //   and new risc0_* registrations). No special pre-verification guard beyond the general
    //   verify_proof_for_circuit + determine_outcome_for_circuit path. This enables
    //   "decentralized_liveness" and "onchain_sig_verify" (and aliases) to obtain oracle sigs
    //   as honest stubs. Full onchain sig verify or multi-party liveness aggregation is future.
    // - RISC0 guests expanded: poker_solver.rs (hand equity), financial_formula.rs (BS approx)
    //   + their _proof.json samples. Registered as risc0_poker_solver / verifiable_poker etc.
    // - Stubs kept honest: no real crypto/ZK exec here, just wiring + fixed responses.
    if input.circuit_type == "decentralized_liveness" || input.circuit_type == "onchain_sig_verify"
    {
        // Explicit branch for documentation / future extension (currently falls to Attested path).
        // Support simulate for easy covenant dev testing (e.g. simulate=partial to test outage paths in .sil covenants).
        // This keeps everything compatible while making liveness/oracle connection to covenants trivial to test.
        if input.circuit_type == "decentralized_liveness" {
            if let Some(s) = &input.simulate {
                std::env::set_var("SIMULATE_LIVENESS", s);
            }
        }
    }

    // Step 1: Verify the proof via pluggable registry (oracle_verifier.rs)
    // Supports StrictGroth16 / HybridGroth16 / Risc0Stub / WasmStub / Attested for 100s of circuits
    // (merkle/range/timelock/hash + new kaspa: utxo_ownership/script_constraint/vrf_* + games + defi + compute + feeds).
    // Special privacy nullifier guard kept above. Multi-oracle + signing kept below.
    let verified = verify_proof_for_circuit(
        &input.circuit_type,
        input.proof.clone(),
        input.public_inputs.clone(),
        input.requested_outcome,
    )
    .await
    .unwrap_or(false);

    if !verified {
        return Json(OracleVerifyOutput {
            success: false,
            outcome: None,
            signature: None,
            timestamp: None,
            message: None,
            error: Some(format!(
                "ZK / attestation verification failed for circuit '{}' (proof invalid or attestation rejected)",
                input.circuit_type
            )),
            public_inputs: input.public_inputs,
            circuit_type: Some(input.circuit_type.clone()),
            covenant_hint: None,
        });
    }
    let _valid = true;

    // Step 2: Determine the outcome.
    //
    // SECURITY (0.2 - bind game attestations to the SERVER result): if this covenant is a
    // skill_games match, the oracle signs ONLY the outcome the server itself recorded
    // (white->0 / black->1 / draw->2), never a caller-chosen requested_outcome. The game
    // result is server-authoritative (engine replay for board wins, server-timed
    // timeouts), so no caller can get the oracle to attest a losing player as the winner.
    // Non-game covenants (no skill_games row) fall through to the normal ZK/derive path.
    let game_row: Option<(String, Option<String>)> = {
        let conn = db.lock().unwrap();
        conn.query_row(
            "SELECT status, winner FROM skill_games WHERE covenant_id = ?1",
            rusqlite::params![input.covenant_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .ok()
    };
    let outcome: u32 = if let Some((status, winner)) = game_row {
        if status != "finished" {
            return Json(OracleVerifyOutput {
                success: false,
                outcome: None,
                signature: None,
                timestamp: None,
                message: None,
                error: Some("oracle will not attest an unfinished game".into()),
                public_inputs: input.public_inputs,
                circuit_type: Some(input.circuit_type.clone()),
                covenant_hint: None,
            });
        }
        let server_outcome = match winner.as_deref().map(|w| w.to_lowercase()).as_deref() {
            Some("white") | Some("player1") => 0u32,
            Some("black") | Some("player2") => 1u32,
            Some("draw") => 2u32,
            other => {
                return Json(OracleVerifyOutput {
                    success: false,
                    outcome: None,
                    signature: None,
                    timestamp: None,
                    message: None,
                    error: Some(format!(
                        "game has no settleable winner (recorded: {other:?})"
                    )),
                    public_inputs: input.public_inputs,
                    circuit_type: Some(input.circuit_type.clone()),
                    covenant_hint: None,
                });
            }
        };
        if let Some(req) = input.requested_outcome {
            if req != server_outcome {
                return Json(OracleVerifyOutput {
                    success: false,
                    outcome: None,
                    signature: None,
                    timestamp: None,
                    message: None,
                    error: Some(format!(
                        "requested outcome {req} contradicts the server-recorded game result {server_outcome}; the oracle attests only the real winner"
                    )),
                    public_inputs: input.public_inputs,
                    circuit_type: Some(input.circuit_type.clone()),
                    covenant_hint: None,
                });
            }
        }
        server_outcome
    } else {
        // Not a game covenant. The oracle must NOT sign an outcome it has not
        // cryptographically verified. Signing is allowed ONLY when the circuit is a
        // Strict/Hybrid Groth16 type (circuit_requires_crypto_proof) AND its proof
        // passed snarkjs above (verified == true). An Attested circuit performs NO
        // crypto check - `verified` is unconditionally true for it - so signing its
        // caller-supplied requested_outcome would let ANYONE mint a valid oracle
        // signature for ANY outcome on ANY covenant_id. The earlier
        // proof_has_groth16_body shape check was bypassable by planting a junk
        // {"pi_a":[...]} body on an attested circuit; gating on the registered
        // verifier kind (not proof shape) closes that. The outcome is derived from
        // the VERIFIED public signals, never from the attacker's requested_outcome.
        if !circuit_requires_crypto_proof(&input.circuit_type) {
            return Json(OracleVerifyOutput {
                success: false,
                outcome: None,
                signature: None,
                timestamp: None,
                message: None,
                error: Some(format!(
                    "oracle declines to sign an unverified outcome for '{}': it is an attested circuit with no cryptographic proof. Only a server-resolved game covenant or a real Groth16 proof (a Strict/Hybrid circuit) can be signed.",
                    input.circuit_type
                )),
                public_inputs: input.public_inputs,
                circuit_type: Some(input.circuit_type.clone()),
                covenant_hint: None,
            });
        }
        // SECURITY (H4): bind the proof to THIS covenant_id to stop cross-covenant
        // signature replay. The signed message includes the caller-supplied covenant_id,
        // but nothing ties the *proof* to it: a proof verified for covenant A can be
        // re-submitted with covenant_id=B and the oracle would happily sign B's message
        // ("portable proof" replay). The binding here requires the proof's public signals
        // to contain the field element H(covenant_id) := sha256(covenant_id) reduced mod
        // the BN254 scalar field, so a proof can only mint a signature for the exact
        // covenant whose id was committed as a public input at proving time.
        //
        // RESIDUAL RISK / why this is "partial": the existing strict circuits
        // (merkle/range/timelock/hash/etc.) do NOT currently emit covenant_id as a public
        // signal, so a HARD requirement would break every legitimate proof today. We
        // therefore gate enforcement:
        //   * If H(covenant_id) IS among the public inputs -> the proof is correctly bound;
        //     allow (this is the sound, replay-safe path).
        //   * If it is NOT present -> we cannot cryptographically bind. With
        //     COVEX_REQUIRE_COVENANT_BINDING=true the oracle rejects loudly (recommended
        //     once circuits emit the binding). By default we allow but emit a loud warning,
        //     so merkle/range keep working. FULLY closing this requires a circuit-side
        //     change: add a public `covenantId` signal to each non-game circuit and have
        //     provers commit sha256(covenant_id) mod r. Until then a proof for one covenant
        //     can still be replayed onto another covenant of the SAME circuit type when the
        //     circuit omits the binding signal.
        let expected_covenant_fe = covenant_field_element(&input.covenant_id);
        let bound = input
            .public_inputs
            .iter()
            .any(|s| s.trim() == expected_covenant_fe);
        if !bound {
            // H4 fail-closed: the 14 recompiled strict circuits now emit a covenantId public signal,
            // and their in-browser provers commit covenant_field_element(covenant_id). For those, a
            // missing binding means the proof is NOT bound to this covenant (a replay or an old
            // pre-H4 proof), so refuse to sign regardless of the env var. Other circuits keep the
            // env-gated behavior so nothing legacy breaks.
            let strict = circuit_emits_covenant_binding(&input.circuit_type)
                || std::env::var("COVEX_REQUIRE_COVENANT_BINDING").as_deref() == Ok("true");
            if strict {
                return Json(OracleVerifyOutput {
                    success: false,
                    outcome: None,
                    signature: None,
                    timestamp: None,
                    message: None,
                    error: Some(format!(
                        "covenant binding missing: proof for circuit '{}' does not commit covenant_id (expected public input {} = sha256(covenant_id) mod BN254). Refusing to sign to prevent cross-covenant proof replay (COVEX_REQUIRE_COVENANT_BINDING=true).",
                        input.circuit_type, expected_covenant_fe
                    )),
                    public_inputs: input.public_inputs,
                    circuit_type: Some(input.circuit_type.clone()),
                    covenant_hint: None,
                });
            }
            tracing::warn!(
                "H4 covenant binding ABSENT for covenant {} (circuit {}): proof does not commit \
                 sha256(covenant_id) mod BN254 ({}) as a public input. Signing anyway for \
                 backward compatibility (legacy circuits omit the binding signal); this proof \
                 could be replayed onto another covenant of the same circuit type. Set \
                 COVEX_REQUIRE_COVENANT_BINDING=true once circuits emit the binding to fail closed.",
                &input.covenant_id[..16.min(input.covenant_id.len())],
                input.circuit_type,
                expected_covenant_fe
            );
        }
        // verified == true here means snarkjs accepted the proof; derive the outcome
        // from the cryptographically-bound public signals (requested_outcome ignored).
        determine_outcome_for_circuit(
            &input.circuit_type,
            &input.proof,
            &input.public_inputs,
            None,
        )
    };

    // Step 3: Sign the outcome
    // Message format: "covex-oracle:<covenant_id>:<outcome>:<timestamp>"
    let message = format!(
        "covex-oracle:{}:{}:{}",
        input.covenant_id, outcome, timestamp
    );

    // Phase 15: Real Multi-Oracle Cryptographic Verification
    if let Some(multi) = &input.multi_oracle {
        let threshold = multi.threshold;
        let mut valid_weight = 0u32;

        let verifier = Secp256k1::verification_only();
        let digest = message_digest(&message);
        for sig_entry in &multi.signatures {
            // Find the matching provider.
            if let Some(provider) = multi
                .providers
                .iter()
                .find(|p| p.public_key == sig_entry.public_key)
            {
                // REAL BIP340 Schnorr verification: the provider must have actually signed
                // the outcome message with their key. (The old code compared
                // sha256(pubkey||message) to the supplied signature - a keyless MAC anyone
                // could forge with zero private keys, providing no security at all.)
                let xonly = match hex::decode(&provider.public_key)
                    .ok()
                    .and_then(|b| secp256k1::XOnlyPublicKey::from_slice(&b).ok())
                {
                    Some(x) => x,
                    None => continue,
                };
                let sig = match hex::decode(sig_entry.signature.trim())
                    .ok()
                    .and_then(|b| Signature::from_slice(&b).ok())
                {
                    Some(s) => s,
                    None => continue,
                };
                if verifier.verify_schnorr(&sig, &digest, &xonly).is_ok() {
                    valid_weight += if provider.weight > 0 {
                        provider.weight
                    } else {
                        1
                    };
                }
            }
        }

        if valid_weight < threshold {
            return Json(OracleVerifyOutput {
                success: false,
                outcome: None,
                signature: None,
                timestamp: None,
                message: None,
                error: Some(format!(
                    "Multi-oracle threshold not met: weight {}/{} (need {})",
                    valid_weight,
                    multi.signatures.len(),
                    threshold
                )),
                public_inputs: input.public_inputs,
                circuit_type: Some(input.circuit_type.clone()),
                covenant_hint: None,
            });
        }

        info!(
            "Multi-oracle cryptographic verification passed (weight {}/{}) for covenant {}",
            valid_weight,
            threshold,
            &input.covenant_id[..16.min(input.covenant_id.len())]
        );
    }

    // Real BIP340 Schnorr signature over the outcome message (verifiable on-chain).
    let signature = sign_outcome(&message);

    info!(
        "Oracle signed outcome {} for covenant {} (circuit: {})",
        outcome,
        &input.covenant_id[..16.min(input.covenant_id.len())],
        input.circuit_type
    );

    // Surface the resolution in the live activity feed and per-covenant history
    {
        let conn = db.lock().unwrap();
        let network: String = conn
            .query_row(
                "SELECT network FROM covenants WHERE tx_id = ?1",
                rusqlite::params![input.covenant_id],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| "testnet-12".to_string());
        crate::db::record_event(
            &conn,
            "resolution_signed",
            &input.covenant_id,
            &network,
            0.0,
            &input.circuit_type,
        );
    }

    if input.circuit_type == "privacy_mixer_v1" && outcome == 0 {
        if let Some(nullifier) = input.public_inputs.get(2) {
            let _ = crate::db::mixer_record_nullifier(&db, nullifier, &input.covenant_id);
        }
    }

    Json(OracleVerifyOutput {
        success: true,
        outcome: Some(outcome),
        signature: Some(signature),
        timestamp: Some(timestamp),
        message: Some(message),
        error: None,
        public_inputs: input.public_inputs,
        // Extra fields for easy covenant integration (ZK + oracle sig drop-in for SilverScript/aa20+)
        circuit_type: Some(input.circuit_type.clone()),
        covenant_hint: Some(format!(
            "Use signature + outcome for covenant_id '{}'. Check against Covex oracle pubkey. circuit={}",
            input.covenant_id, input.circuit_type
        )),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oracle_schnorr_roundtrip() {
        // The oracle now fails closed without COVEX_ORACLE_KEY (no baked-in default),
        // so the test supplies its own throwaway key rather than relying on a secret.
        std::env::set_var(
            "COVEX_ORACLE_KEY",
            "1111111111111111111111111111111111111111111111111111111111111111",
        );
        let message = "covex-oracle:test123:0:1717000000";
        let sig = sign_outcome(message);
        // BIP340 schnorr signature: 64 bytes = 128 hex chars
        assert_eq!(sig.len(), 128);
        // a valid oracle signature verifies
        assert!(verify_outcome(message, &sig), "oracle sig must verify");
        // tampered message does NOT verify
        assert!(!verify_outcome("covex-oracle:test123:1:1717000000", &sig));
        // a garbage signature does NOT verify
        assert!(!verify_outcome(message, &"ab".repeat(64)));
        // the pubkey is a 32-byte x-only key
        assert_eq!(oracle_xonly_pubkey_hex().len(), 64);
    }

    /// Test that verify_merkle_proof with a real valid proof returns Ok(true).
    /// Requires the ZK artifacts to exist at ../zk/.
    #[test]
    fn test_verify_valid_merkle_proof() {
        // Load the known-good proof from merkle_proof.json
        let proof_path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../zk/merkle_proof.json");

        if !proof_path.exists() {
            eprintln!("Skipping test: merkle_proof.json not found");
            return;
        }

        let proof_data: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&proof_path).unwrap()).unwrap();

        let proof = &proof_data["proof"];
        let public_inputs: Vec<String> = proof_data["publicSignals"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap_or("0").to_string())
            .collect();

        let result = verify_merkle_proof(proof, &public_inputs);
        // Skip gracefully when the snarkjs verifier is not installed in this
        // environment (e.g. CI without the zk/ node deps). We assert only when the
        // verifier can actually run; a missing-module error is an env gap, not a bug.
        if let Err(e) = &result {
            if e.contains("snarkjs")
                || e.contains("Cannot find module")
                || e.contains("MODULE_NOT_FOUND")
            {
                eprintln!("Skipping test: snarkjs verifier unavailable ({e})");
                return;
            }
        }
        assert!(result.is_ok(), "Verification should succeed: {:?}", result);
        assert!(result.unwrap(), "Proof should be valid");
    }

    /// Test that a tampered proof is rejected.
    #[test]
    fn test_reject_tampered_proof() {
        let proof_path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../zk/merkle_proof.json");

        if !proof_path.exists() {
            eprintln!("Skipping test: merkle_proof.json not found");
            return;
        }

        let proof_data: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&proof_path).unwrap()).unwrap();

        let mut proof = proof_data["proof"].clone();
        // Tamper with pi_a
        proof["pi_a"][0] = serde_json::Value::String("1234".to_string());

        let public_inputs: Vec<String> = vec!["1".to_string(), "999999999999999999".to_string()];

        let result = verify_merkle_proof(&proof, &public_inputs);
        match result {
            Ok(valid) => assert!(!valid, "Tampered proof should NOT be valid"),
            Err(_) => {} // OK if it fails on verification too
        }
    }
}

/// GET /api/oracle/liveness : honest status of the live oracle.
/// (public path via nginx/vite proxy stripping /api; registered as /oracle/liveness)
///
/// Covex runs ONE BIP340 oracle today (a single signing key, supplied via COVEX_ORACLE_KEY).
/// There is no multi-operator federation yet, so this reports operators=1, threshold=1 and
/// NEVER fabricates a quorum. `liveness` is true only when a real signing key is configured and
/// derives a valid public identity; if the key is unset the oracle fails closed and we say so.
/// A multi-oracle set with heartbeats / weights / threshold signatures is roadmap, not live.
async fn oracle_liveness_handler() -> Json<serde_json::Value> {
    // Is a usable signing key configured? (mirror oracle_key_bytes' fail-closed checks, but
    // without panicking - this is an observability endpoint, so it must degrade gracefully).
    let key_configured = std::env::var("COVEX_ORACLE_KEY")
        .map(|v| {
            let t = v.trim();
            !t.is_empty() && t != ORACLE_KEY_PLACEHOLDER
        })
        .unwrap_or(false);
    // Deriving the public identity needs the key; guard so a missing/invalid key degrades to a
    // clean "not signing" response instead of aborting the request task.
    let pubkey = if key_configured {
        std::panic::catch_unwind(oracle_xonly_pubkey_hex).ok()
    } else {
        None
    };
    let live = pubkey.is_some();
    Json(serde_json::json!({
        "liveness": live,
        "operators": if live { 1 } else { 0 },
        "threshold": 1,
        "scheme": "bip340-schnorr-secp256k1",
        "xonly_pubkey": pubkey,
        "signing_available": live,
        "multi_oracle": false,
        "note": "Single-operator oracle (one BIP340 signing key). Multi-operator federation with threshold signatures is roadmap, not live."
    }))
}

// Phase 3 decentralized oracle wiring complete:
// - liveness route + spawn_blocking stub call (delegates to checkLiveness() in enhanced zk/*_liveness_stub.js)
// - explicit handling/doc in verify_and_sign_handler for decentralized_liveness + onchain_sig_verify
// - new RISC0 guests registered in oracle_verifier.rs
// All honest stubs. See also zk/decentralized_liveness_stub.js and risc0_guests/ .

// Phase 4 prep note (decentralized enhancement):
// zk/oracle_liveness_stub.js now exports checkMultiOracleLiveness(providers, threshold) in addition to checkLiveness.
// decentralized_liveness_stub.js re-exports it. This provides a simple multi-oracle stub / liveness check.
// Can be called from frontend, tests, or future oracle net code; integrates with proving_mode (chess etc.)
// and on-chain sig examples (oracle outcome + mode can be attested by multi-oracle set).
// Still stub (always healthy); real impl would add heartbeats, weights, slashing, BLS threshold sigs.
// See enhanced stubs + chess_covenant_mode_oracle.sil for cross-ref to mode+sig consumption.
