//! # zk_prover_client: call the off-box RISC0->Groth16 prover service for an on-chain game settle.
//!
//! The 7GB Covex backend host CANNOT prove a RISC0->Groth16 receipt (the stark2snark wrap needs
//! x86_64 + Docker + >=12GB RAM). So the on-chain ZK settle route does NOT prove in-process: it POSTs
//! the reconstructed `GameInput` to a separate PROVER SERVICE (see `prover-service/`) at the URL in
//! `COVEX_PROVER_URL`. That service runs `covex-games-prover prove-groth16` + `settle-spend` and
//! returns the byte-exact on-chain settle material.
//!
//! HONEST FAILURE: a missing / unreachable / erroring prover yields a clear error here. It NEVER
//! fabricates a proof. The chain is the final verifier anyway (a bad proof is rejected by consensus),
//! but the route refuses to hand the user a witness it could not obtain from a real prover.

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// The `GameInput` the prover service replays + proves. Field names match the prover CLI's friendly
/// `JsonGameInput` (game_type string; players/covenant_id as 64-char hex; moves as notation strings).
#[derive(Debug, Clone, Serialize)]
pub struct ProverGameInput {
    pub game_type: String,
    pub moves: Vec<String>,
    /// [player1, player2] x-only keys as 64-char hex. These MUST equal the keys the covenant baked,
    /// so the proof's `players[winner]` (the journal payee) matches the on-chain winner key.
    pub players: [String; 2],
    /// The deploy tx id of THIS pot, 64-char hex. Binds the proof to this covenant (cross-pot replay
    /// is blocked because covenant_id folds into the claim digest -> the baked public inputs).
    pub covenant_id: String,
    /// Staked amount in sompi (echoed into the journal; carried for the caller's payout math).
    pub stake_sompi: u64,
    /// Per-move elapsed_ms (untimed games omit it -> the service defaults to all-zero).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub elapsed_ms: Option<Vec<u64>>,
}

/// The on-chain settle material the prover service returns (the `settle-spend` JSON shape). All hex.
#[derive(Debug, Clone, Deserialize)]
pub struct ProverSettleSpend {
    pub proof_hex: String,
    pub vk_hex: String,
    /// The 5 Groth16 public inputs (ABI order a0,a1,c0,c1,id), each 32-byte LE hex.
    pub public_inputs: Vec<String>,
    /// The journal payee id (`players[winner]`).
    pub winner_pubkey: String,
    /// The pot this proof settles (echoed from the journal).
    pub covenant_id: String,
    /// 0 = player1, 1 = player2 (a draw is rejected upstream).
    pub winner_code: u8,
    pub stake_sompi: u64,
    /// The frozen guest image id (for the caller's pinning sanity check).
    #[serde(default)]
    pub image_id: Option<String>,
}

/// The prover service URL from `COVEX_PROVER_URL` (e.g. `http://127.0.0.1:7720`). Empty/unset means
/// no prover is configured: the route fails closed with an honest message rather than fabricating.
pub fn prover_url() -> Option<String> {
    std::env::var("COVEX_PROVER_URL")
        .ok()
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
}

/// Groth16 proving is heavy (composite STARK -> succinct -> Docker wrap), so allow a long timeout.
/// Overridable with `COVEX_PROVER_TIMEOUT_SECS`.
fn prover_timeout() -> Duration {
    let secs = std::env::var("COVEX_PROVER_TIMEOUT_SECS")
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(900);
    Duration::from_secs(secs)
}

/// POST the `GameInput` to the prover service and return the on-chain settle material. Errors with a
/// caller-surfaceable message on any failure (no prover configured, network error, non-2xx, the
/// service reporting an unprovable game, or a malformed response). NEVER returns a fabricated proof.
pub async fn request_settle_spend(
    input: &ProverGameInput,
) -> Result<ProverSettleSpend, String> {
    let base = prover_url().ok_or_else(|| {
        "on-chain ZK settlement needs a prover service: COVEX_PROVER_URL is not set (the backend host cannot prove RISC0->Groth16; run prover-service on a Docker + >=12GB RAM box). See prover-service/README.md".to_string()
    })?;
    let url = format!("{base}/prove-game-settle");

    let client = reqwest::Client::builder()
        .timeout(prover_timeout())
        .build()
        .map_err(|e| format!("could not initialize the prover HTTP client: {e}"))?;

    let resp = client
        .post(&url)
        .json(input)
        .send()
        .await
        .map_err(|e| format!("the prover service ({base}) could not be reached: {e}"))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("could not read the prover service response: {e}"))?;

    if !status.is_success() {
        // Surface the service's own error body when present (it reports unprovable games honestly).
        let detail = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(|s| s.to_string()))
            .unwrap_or_else(|| body.chars().take(400).collect());
        return Err(format!(
            "the prover service returned status {} ({}): {detail}",
            status.as_u16(),
            base
        ));
    }

    let parsed: ProverSettleSpend = serde_json::from_str(&body)
        .map_err(|e| format!("the prover service response was not the expected settle JSON: {e}"))?;

    if parsed.proof_hex.trim().is_empty() || parsed.public_inputs.len() != 5 {
        return Err(
            "the prover service response is missing the proof or did not return 5 public inputs"
                .to_string(),
        );
    }
    Ok(parsed)
}
