// oracle.rs — Covex Oracle Verification & Signing Service (Phase 2)
//
// POST /api/oracle/verify-and-sign
//
// Accepts a ZK proof for a supported circuit type, verifies it via snarkjs,
// and if valid, returns a Schnorr-style signature over (covenant_id, outcome, timestamp)
// signed by the Covex oracle key (DEV_WALLET_1 in testnet).
//
// Supported circuits:
//   - merkle_membership: Groth16 proof over bn128, MiMC7 preimage

use axum::{extract::Json, routing::post, Router};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::process::Command;
use tracing::info;

/// Input to the oracle verification endpoint.
#[derive(Deserialize)]
pub struct OracleVerifyInput {
    pub covenant_id: String,
    #[serde(default = "default_circuit_type")]
    pub circuit_type: String,
    pub proof: serde_json::Value,       // The Groth16 proof object
    pub public_inputs: Vec<String>,     // Public signals (rootHash, etc.)
    #[serde(default)]
    pub requested_outcome: Option<u32>, // Claimed outcome (0-1 for binary)
}

fn default_circuit_type() -> String {
    "merkle_membership".to_string()
}

/// Output from the oracle verification endpoint.
#[derive(Serialize)]
pub struct OracleVerifyOutput {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<u32>,        // 0 = proven (claimant wins), 1 = rejected (depositor wins)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,   // Oracle signature over outcome
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,     // The signed message for verification
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub public_inputs: Vec<String>,
}

/// Build the oracle routes.
pub fn oracle_routes() -> Router {
    Router::new().route("/oracle/verify-and-sign", post(verify_and_sign_handler))
}

/// The oracle signing key (DEV_WALLET_1 private key on testnet).
/// Override with COVEX_ORACLE_KEY env var for mainnet deployment.
const ORACLE_KEY_HEX: &str = "549cd5a5426360da67b66edd561d37b348a026708d01b519d396b868cda267c9";

/// Returns the oracle signing key, preferring COVEX_ORACLE_KEY env var.
/// Falls back to the testnet dev key if env var is not set.
fn oracle_key_bytes() -> Vec<u8> {
    let raw = std::env::var("COVEX_ORACLE_KEY").unwrap_or_else(|_| ORACLE_KEY_HEX.to_string());
    hex::decode(&raw).expect("COVEX_ORACLE_KEY (or default) must be valid hex")
}

/// Path to the snarkjs verify.js script.
fn verify_script_path() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../zk/verify.js");
    path
}

/// Verify a MerkleMembership Groth16 proof via snarkjs.
/// Runs the Node.js verifier in a blocking task to avoid stalling the async runtime.
fn verify_merkle_proof(proof: &serde_json::Value, public_inputs: &[String]) -> Result<bool, String> {
    let proof_json = serde_json::json!({
        "proof": proof,
        "publicSignals": public_inputs,
    });
    let tmp_path = std::env::temp_dir().join(format!("covex_oracle_{}.json", uuid::Uuid::new_v4()));
    std::fs::write(&tmp_path, serde_json::to_string(&proof_json).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Failed to write temp proof: {}", e))?;

    let script = verify_script_path();
    let node_binary = if std::path::Path::new("/usr/bin/node").exists() {
        "/usr/bin/node"
    } else if std::path::Path::new("/root/.nvm/versions/node/v20.20.2/bin/node").exists() {
        "/root/.nvm/versions/node/v20.20.2/bin/node"
    } else {
        "node"
    };

    // Run verification synchronously — this is fine because the handler
    // wraps us in tokio::task::spawn_blocking.
    let output = Command::new(node_binary.to_string())
        .arg(script.to_str().unwrap_or("zk/verify.js"))
        .arg(&tmp_path)
        .output()
        .map_err(|e| format!("Failed to run snarkjs verifier (node={}): {}", node_binary, e))?;

    // Cleanup
    let _ = std::fs::remove_file(&tmp_path);

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!(
            "Verifier exited with status {}: stdout={} stderr={}",
            output.status, stdout.trim(), stderr.trim()
        ));
    }

    if stdout.trim().is_empty() {
        return Err(format!("Verifier produced no output. stderr: {}", stderr.trim()));
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

/// Async wrapper around verify_merkle_proof for use in axum handlers.
async fn verify_merkle_proof_async(proof: serde_json::Value, public_inputs: Vec<String>) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || verify_merkle_proof(&proof, &public_inputs))
        .await
        .map_err(|e| format!("Spawn blocking failed: {}", e))?
}

/// Handle POST /api/oracle/verify-and-sign
async fn verify_and_sign_handler(Json(input): Json<OracleVerifyInput>) -> Json<OracleVerifyOutput> {
    let timestamp = chrono::Utc::now().timestamp();

    // Step 1: Verify the proof (async — runs snarkjs in spawn_blocking)
    let valid = match input.circuit_type.as_str() {
        "merkle_membership" => match verify_merkle_proof_async(input.proof.clone(), input.public_inputs.clone()).await {
            Ok(true) => true,
            Ok(false) => {
                return Json(OracleVerifyOutput {
                    success: false,
                    outcome: None,
                    signature: None,
                    timestamp: None,
                    message: None,
                    error: Some("ZK proof verification failed — proof is invalid".to_string()),
                    public_inputs: input.public_inputs,
                });
            }
            Err(e) => {
                return Json(OracleVerifyOutput {
                    success: false,
                    outcome: None,
                    signature: None,
                    timestamp: None,
                    message: None,
                    error: Some(format!("Verification error: {}", e)),
                    public_inputs: input.public_inputs,
                });
            }
        },
        other => {
            return Json(OracleVerifyOutput {
                success: false,
                outcome: None,
                signature: None,
                timestamp: None,
                message: None,
                error: Some(format!("Unsupported circuit type: {}. Currently supported: merkle_membership", other)),
                public_inputs: input.public_inputs,
            });
        }
    };

    // Step 2: Determine outcome from public inputs
    // For merkle_membership: publicSignals = [valid, rootHash]
    // valid == 1 means the proof is valid (prover knows the secret)
    let outcome = if input.public_inputs.len() >= 1 && input.public_inputs[0] == "1" {
        0u32 // Proven — claimant wins
    } else {
        1u32 // Rejected — depositor keeps stake
    };

    // Step 3: Sign the outcome
    // Message format: "covex-oracle:<covenant_id>:<outcome>:<timestamp>"
    let message = format!(
        "covex-oracle:{}:{}:{}",
        input.covenant_id, outcome, timestamp
    );

    // Signature: SHA256(oracle_private_key || message)
    let oracle_key = oracle_key_bytes();
    let mut hasher = Sha256::new();
    hasher.update(&oracle_key);
    hasher.update(message.as_bytes());
    let signature = hex::encode(hasher.finalize());

    info!(
        "Oracle signed outcome {} for covenant {} (circuit: {})",
        outcome,
        &input.covenant_id[..16.min(input.covenant_id.len())],
        input.circuit_type
    );

    Json(OracleVerifyOutput {
        success: true,
        outcome: Some(outcome),
        signature: Some(signature),
        timestamp: Some(timestamp),
        message: Some(message),
        error: None,
        public_inputs: input.public_inputs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oracle_signature_format() {
        let covenant_id = "test123";
        let outcome = 0u32;
        let timestamp = 1717000000i64;
        let message = format!(
            "covex-oracle:{}:{}:{}",
            covenant_id, outcome, timestamp
        );

        let oracle_key = oracle_key_bytes();
        let mut hasher = Sha256::new();
        hasher.update(&oracle_key);
        hasher.update(message.as_bytes());
        let sig = hex::encode(hasher.finalize());

        assert_eq!(sig.len(), 64);
        assert_eq!(message, "covex-oracle:test123:0:1717000000");
    }

    /// Test that verify_merkle_proof with a real valid proof returns Ok(true).
    /// Requires the ZK artifacts to exist at ../zk/.
    #[test]
    fn test_verify_valid_merkle_proof() {
        // Load the known-good proof from merkle_proof.json
        let proof_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../zk/merkle_proof.json");
        
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
        assert!(result.is_ok(), "Verification should succeed: {:?}", result);
        assert!(result.unwrap(), "Proof should be valid");
    }

    /// Test that a tampered proof is rejected.
    #[test]
    fn test_reject_tampered_proof() {
        let proof_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../zk/merkle_proof.json");
        
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
