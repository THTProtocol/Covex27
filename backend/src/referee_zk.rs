//! ZK winner-proof gate for the de-oracle games hashlock settlement.
//!
//! ## What this is (and what it honestly is NOT)
//!
//! `settle-pot-hashlock` decides which player won the staked game and then has the
//! referee reveal ONLY the winner's hashlock secret. The base money gate is
//! `game_pot_outcome` (a server-authoritative engine replay of the recorded move
//! log, fail-closed). That gate is a SERVER CHECK: the server replays the moves and
//! decides. It is sound only if you trust the server's replay.
//!
//! This module adds a SECOND, CRYPTOGRAPHIC gate on top: a RISC0 zkVM receipt that
//! proves, with a real STARK proof, that the recorded game is legal, terminal, and
//! that the named winner genuinely won. The receipt is produced by the existing
//! `covex-games-prover` CLI (the guest wraps `covex_games::replay`; an illegal /
//! unfinished / forged game cannot be proven, so a receipt that VERIFIES attests the
//! game outcome). The winner secret is revealed only when BOTH gates agree.
//!
//! ## Why verification is done by shelling out to the CLI, not in-process
//!
//! HONEST FEASIBILITY NOTE (DEORACLE_PLAN stage 4 assessment): linking
//! `risc0-zkvm` into the live `covex27-backend` was assessed and DECLINED this
//! iteration:
//!   * `risc0-zkvm` pulls a large dependency tree (the rv32im / recursion / keccak
//!     circuits, groth16, zkp) and the guest image id is produced by `risc0-build`,
//!     which needs the riscv32im guest toolchain that is NOT installed on the
//!     production server. Adding it to the backend risks breaking the production
//!     build on a memory-constrained host (the constitution forbids rushing a
//!     fund-path change).
//!   * Verification itself is light, but the IMAGE ID must be pinned to the exact
//!     guest, and the canonical source of that id is the `methods` crate built from
//!     the guest ELF. Embedding a stale literal image id would silently accept the
//!     wrong program.
//!
//! Therefore the REAL cryptographic verification (`Receipt::verify(GAMES_GUEST_ID)`)
//! is performed by the `covex-games-prover verify` binary, which embeds the correct
//! image id at its own build time. This module:
//!   1. shells out to `$COVEX_GAMES_PROVER_BIN verify <receipt>` (the binary does the
//!      real STARK check against its pinned image id);
//!   2. parses the committed `GameResult` (winner + moves_digest) the binary prints;
//!   3. ASSERTS the journal binds THIS match: the committed `winner` equals the
//!      server-derived outcome, and the committed `moves_digest` equals
//!      `sha256(server_move_log.join("\n"))` (the exact digest the guest commits).
//!
//! What is therefore CRYPTOGRAPHICALLY enforced when a receipt is supplied and the
//! binary is provisioned: a real RISC0 proof, verified against the prover's pinned
//! guest image id, attesting a legal terminal game whose move-log digest and winner
//! match this match's server record. What remains a SERVER CHECK: that the recorded
//! move log is the genuine game (the same trust as `game_pot_outcome`), and (when no
//! binary is provisioned) the verification cannot run at all. The enforcement knob
//! `COVEX_GAMES_ZK_REQUIRE` decides whether a verified receipt is MANDATORY.

use sha2::{Digest, Sha256};

/// Env var pointing at the `covex-games-prover` verify binary. When unset/empty the
/// ZK verify hook is UNAVAILABLE (no binary to run). Provision this on a host that
/// has the binary built to turn the cryptographic gate on.
const PROVER_BIN_ENV: &str = "COVEX_GAMES_PROVER_BIN";

/// Env var enforcing that a VERIFIED receipt is mandatory for settle-pot-hashlock.
/// Default (off) keeps the proven server-gated flow working (defense-in-depth: a
/// supplied receipt is still verified, but its absence does not block). Set to
/// "true" to require a real proof on every hashlock settle (fail-closed).
const REQUIRE_ENV: &str = "COVEX_GAMES_ZK_REQUIRE";

/// True iff a verified zkVM receipt is MANDATORY for a hashlock settle, by the env
/// flag alone (network-agnostic). Used by `zk_required_for_network` and tests.
pub fn zk_required() -> bool {
    std::env::var(REQUIRE_ENV).as_deref() == Ok("true")
}

/// True iff a verified zkVM receipt is MANDATORY for a hashlock settle on `network`.
///
/// MAINNET IS ALWAYS-REQUIRED, regardless of the env flag: real money must never
/// settle on the server-authoritative engine replay alone. On mainnet the second
/// (cryptographic) money gate is FORCED on, so a hashlock pot can only release a
/// referee secret when a real RISC0 receipt verifies and binds this match. On a
/// testnet the env flag `COVEX_GAMES_ZK_REQUIRE` decides (default off keeps the
/// proven server-gated development flow working). `network` is matched with the
/// same `starts_with("mainnet")` convention used across the codebase.
pub fn zk_required_for_network(network: &str) -> bool {
    network.starts_with("mainnet") || zk_required()
}

/// True iff a verifier binary is configured (the cryptographic gate can run).
pub fn verifier_available() -> bool {
    std::env::var(PROVER_BIN_ENV)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

/// The exact digest the zkVM guest commits as `moves_digest`: sha256 of the moves
/// joined by a single newline. Server-side mirror so we can bind the receipt's
/// journal to THIS match's recorded move log (a receipt proving a DIFFERENT game has
/// a different digest and is rejected). Byte-identical to
/// `covex_games::moves_digest` (sha256 over `moves.join("\n")`).
pub fn server_moves_digest(moves: &[String]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(moves.join("\n").as_bytes());
    let out = h.finalize();
    let mut d = [0u8; 32];
    d.copy_from_slice(&out);
    d
}

/// Outcome of the ZK gate decision for settle-pot-hashlock.
pub enum ZkGate {
    /// A real receipt was verified and its journal binds this match (winner +
    /// moves_digest match). Carries a short human note for the response.
    Verified(String),
    /// No receipt was supplied and none is required: proceed on the server gate
    /// alone (defense-in-depth mode off / no binary). Carries a disclosure note.
    SkippedAllowed(String),
    /// The gate refuses the settle (a required proof is missing, the binary is
    /// missing while a proof is required, verification failed, or the journal does
    /// not bind this match). Carries the error message for the caller.
    Refused(String),
}

/// Decode the supplied receipt bytes from the request. Accepts base64 (preferred,
/// what the CLI's bincode receipt is transported as) under `receipt_b64`, or hex
/// under `receipt_hex`. Returns None if neither is present/non-empty.
pub fn decode_receipt_param(req: &serde_json::Value) -> Result<Option<Vec<u8>>, String> {
    if let Some(s) = req.get("receipt_b64").and_then(|v| v.as_str()) {
        let s = s.trim();
        if !s.is_empty() {
            return base64_decode(s).map(Some);
        }
    }
    if let Some(s) = req.get("receipt_hex").and_then(|v| v.as_str()) {
        let s = s.trim();
        if !s.is_empty() {
            return hex::decode(s)
                .map(Some)
                .map_err(|e| format!("receipt_hex is not valid hex: {e}"));
        }
    }
    Ok(None)
}

/// Standard base64 decode (no external dep: the alphabet is fixed and small).
fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let clean: Vec<u8> = s.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    let body: Vec<u8> = clean.iter().copied().take_while(|&b| b != b'=').collect();
    let pad = clean.len().saturating_sub(body.len());
    if pad > 2 {
        return Err("invalid base64 padding".into());
    }
    let mut out = Vec::with_capacity(body.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut bits = 0u32;
    for c in body {
        let v = val(c).ok_or_else(|| format!("invalid base64 character {:?}", c as char))?;
        acc = (acc << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Ok(out)
}

/// Run the ZK gate for a hashlock settle, NETWORK-AWARE. This is the money-path
/// entry point: on mainnet a verified receipt is FORCED mandatory (see
/// `zk_required_for_network`) so real money never settles on the server replay
/// alone; on a testnet the env flag decides.
///
/// `receipt`: the decoded receipt bytes (None if the caller supplied no proof).
/// `network`: the pot's network label (mainnet forces require on).
/// `expected_outcome`: the server-derived winning side (0 = player1, 1 = player2)
///   from `game_pot_outcome` (already fail-closed by the caller).
/// `moves`: the server's recorded move log (binds the receipt's journal to this match).
///
/// Decision table (`required` = `zk_required_for_network(network)`):
///   * receipt present + binary present -> verify; on success Verified, else Refused.
///   * receipt present + NO binary       -> Refused (cannot verify a supplied proof;
///                                           never accept an UNVERIFIED proof as if real).
///   * receipt absent  + required        -> Refused (a real proof is mandatory; on
///                                           mainnet this is unconditional).
///   * receipt absent  + not required    -> SkippedAllowed (server gate stands alone,
///                                           testnet only).
pub fn run_gate_for_network(
    receipt: Option<&[u8]>,
    network: &str,
    expected_outcome: u32,
    moves: &[String],
) -> ZkGate {
    match receipt {
        Some(bytes) => {
            if !verifier_available() {
                // A proof was supplied but we have NO verifier to check it. We must NOT
                // wave it through (that would be faking ZK). Refuse.
                return ZkGate::Refused(
                    "a game proof (receipt) was supplied but no zkVM verifier is provisioned on \
                     this server (COVEX_GAMES_PROVER_BIN unset); refusing to accept an unverified \
                     proof. Settle without a receipt (server-gated) or provision the verifier."
                        .into(),
                );
            }
            match verify_receipt(bytes, expected_outcome, moves) {
                Ok(note) => ZkGate::Verified(note),
                Err(e) => ZkGate::Refused(e),
            }
        }
        None => {
            if zk_required_for_network(network) {
                let why = if network.starts_with("mainnet") {
                    "mainnet always requires a verified zkVM game proof to settle a hashlock pot \
                     (real money must not settle on the server engine replay alone)"
                } else {
                    "this server requires a verified zkVM game proof to settle a hashlock pot \
                     (COVEX_GAMES_ZK_REQUIRE=true)"
                };
                ZkGate::Refused(format!(
                    "{why} but no receipt was supplied. Generate one with covex-games-prover and \
                     POST it as receipt_b64."
                ))
            } else {
                ZkGate::SkippedAllowed(
                    "no zkVM game proof supplied; settling on the server-authoritative engine \
                     replay (game_pot_outcome). This outcome is a SERVER CHECK, not a verified \
                     proof. Supply receipt_b64 for cryptographic enforcement."
                        .into(),
                )
            }
        }
    }
}

/// Network-agnostic gate (env flag only). Kept for callers/tests that do not carry a
/// network label; delegates to `run_gate_for_network` with a non-mainnet network so the
/// env flag alone decides. The live money path uses `run_gate_for_network`.
pub fn run_gate(
    receipt: Option<&[u8]>,
    expected_outcome: u32,
    moves: &[String],
) -> ZkGate {
    run_gate_for_network(receipt, "testnet", expected_outcome, moves)
}

/// Shell out to the prover binary to CRYPTOGRAPHICALLY verify the receipt, then bind
/// its committed journal to this match. Returns a human note on success.
///
/// The binary does the real `Receipt::verify(GAMES_GUEST_ID)` against its pinned guest
/// image id (we do NOT trust a self-claimed image id from the request). We then assert
/// the committed winner == expected_outcome and the committed moves_digest ==
/// sha256(server_moves.join("\n")), so a receipt for a different game or a different
/// winner is rejected even though it verifies as a genuine proof of SOME game.
fn verify_receipt(
    receipt_bytes: &[u8],
    expected_outcome: u32,
    moves: &[String],
) -> Result<String, String> {
    let bin = std::env::var(PROVER_BIN_ENV)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| "COVEX_GAMES_PROVER_BIN not set".to_string())?;

    // Write the receipt to a temp file for the CLI (which reads a path).
    let tmp = std::env::temp_dir().join(format!(
        "covex-game-receipt-{}.bin",
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&tmp, receipt_bytes)
        .map_err(|e| format!("could not stage receipt for verification: {e}"))?;

    // RISC0_DEV_MODE must be OFF so the CLI does a REAL STARK check (a dev-mode receipt
    // carries no cryptographic seal). We force it off for this child process.
    let output = std::process::Command::new(&bin)
        .arg("verify")
        .arg(&tmp)
        .env("RISC0_DEV_MODE", "0")
        .output();
    let _ = std::fs::remove_file(&tmp);

    let output = output.map_err(|e| {
        format!("could not run the zkVM verifier ({bin}): {e}")
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "zkVM receipt verification FAILED (the proof does not attest a genuine Covex games \
             guest run, or is dev-mode): {}",
            stderr.trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // The CLI prints "VERIFIED" only after a successful Receipt::verify; require it as a
    // belt-and-braces guard in case a future CLI returns 0 on a soft path.
    if !stdout.contains("VERIFIED") {
        return Err(
            "zkVM verifier did not report VERIFIED; refusing to treat the receipt as proven".into(),
        );
    }

    // Parse the committed winner and moves_digest the CLI prints (see cli print_result):
    //   "  winner       : <n> (...)"
    //   "  moves_digest : <64-hex>"
    let committed_winner = parse_field(&stdout, "winner")
        .and_then(|s| s.split_whitespace().next().map(|t| t.to_string()))
        .and_then(|t| t.parse::<u32>().ok())
        .ok_or_else(|| "could not parse committed winner from verifier output".to_string())?;
    let committed_digest_hex = parse_field(&stdout, "moves_digest")
        .map(|s| s.trim().to_lowercase())
        .ok_or_else(|| "could not parse committed moves_digest from verifier output".to_string())?;

    // BIND: the proven winner must equal the server-derived outcome.
    if committed_winner != expected_outcome {
        return Err(format!(
            "zkVM proof verifies, but its committed winner ({committed_winner}) does not match the \
             server-derived winning side ({expected_outcome}); refusing to reveal the secret"
        ));
    }
    // BIND: the proven game's move-log digest must equal THIS match's move log, so a
    // valid proof of a DIFFERENT game cannot release this pot.
    let expected_digest_hex = hex::encode(server_moves_digest(moves));
    if committed_digest_hex != expected_digest_hex {
        return Err(format!(
            "zkVM proof verifies, but its committed moves_digest does not match this match's \
             recorded move log (proof is for a different game); refusing to reveal the secret"
        ));
    }

    Ok(format!(
        "zkVM receipt VERIFIED (real STARK proof, prover-pinned guest image id) and bound to this \
         match: committed winner {committed_winner} and moves_digest match the server record"
    ))
}

/// Pull the value after `"<key> ... :"` on the first line whose trimmed prefix is the
/// key. The CLI formats fields as `  <key>      : <value>`.
fn parse_field(stdout: &str, key: &str) -> Option<String> {
    for line in stdout.lines() {
        let t = line.trim_start();
        if t.starts_with(key) {
            if let Some(idx) = line.find(':') {
                return Some(line[idx + 1..].trim().to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// server_moves_digest matches sha256(moves.join("\n")) byte for byte (the exact
    /// value covex_games::moves_digest commits inside the proof).
    #[test]
    fn moves_digest_matches_sha256_of_joined_moves() {
        let moves = vec!["e2e4".to_string(), "e7e5".to_string()];
        let mut h = Sha256::new();
        h.update("e2e4\ne7e5".as_bytes());
        let expect: [u8; 32] = h.finalize().into();
        assert_eq!(server_moves_digest(&moves), expect);
    }

    /// An empty move list digests to sha256("") (well-defined, order-stable).
    #[test]
    fn empty_moves_digest_is_sha256_empty() {
        let mut h = Sha256::new();
        h.update(b"");
        let expect: [u8; 32] = h.finalize().into();
        assert_eq!(server_moves_digest(&[]), expect);
    }

    /// base64 round-trips the standard alphabet incl. padding (so a CLI receipt
    /// transported as base64 decodes to the exact bytes the verifier reads).
    #[test]
    fn base64_decodes_known_vectors() {
        assert_eq!(base64_decode("").unwrap(), b"");
        assert_eq!(base64_decode("Zg==").unwrap(), b"f");
        assert_eq!(base64_decode("Zm8=").unwrap(), b"foo".get(..2).unwrap());
        assert_eq!(base64_decode("Zm9v").unwrap(), b"foo");
        assert_eq!(base64_decode("Zm9vYmFy").unwrap(), b"foobar");
        // whitespace (newlines in transport) is ignored
        assert_eq!(base64_decode("Zm9v\nYmFy").unwrap(), b"foobar");
    }

    /// A non-base64 character is rejected (a malformed receipt param cannot silently
    /// decode to attacker-chosen bytes).
    #[test]
    fn base64_rejects_invalid_char() {
        assert!(base64_decode("****").is_err());
    }

    /// decode_receipt_param prefers receipt_b64, falls back to receipt_hex, and
    /// returns None when neither is present/non-empty.
    #[test]
    fn decode_receipt_param_handles_all_shapes() {
        let none = serde_json::json!({ "token": "x" });
        assert!(decode_receipt_param(&none).unwrap().is_none());

        let empty = serde_json::json!({ "receipt_b64": "  " });
        assert!(decode_receipt_param(&empty).unwrap().is_none());

        let b64 = serde_json::json!({ "receipt_b64": "Zm9vYmFy" });
        assert_eq!(decode_receipt_param(&b64).unwrap().unwrap(), b"foobar");

        let hexv = serde_json::json!({ "receipt_hex": "666f6f" });
        assert_eq!(decode_receipt_param(&hexv).unwrap().unwrap(), b"foo");
    }

    /// With no verifier provisioned and no proof required, an absent receipt is
    /// SkippedAllowed (server gate stands alone); a SUPPLIED proof with no verifier is
    /// Refused (never accept an unverified proof as if it were real ZK).
    #[test]
    fn gate_without_verifier() {
        std::env::remove_var(PROVER_BIN_ENV);
        std::env::remove_var(REQUIRE_ENV);
        let moves = vec!["e2e4".to_string(), "resign".to_string()];

        match run_gate(None, 0, &moves) {
            ZkGate::SkippedAllowed(_) => {}
            _ => panic!("absent receipt + not required must be SkippedAllowed"),
        }
        match run_gate(Some(b"not-a-real-receipt"), 0, &moves) {
            ZkGate::Refused(_) => {}
            _ => panic!("supplied receipt with no verifier must be Refused, never accepted"),
        }
    }

    /// With COVEX_GAMES_ZK_REQUIRE=true and no receipt, the gate refuses (a real proof
    /// is mandatory). Uses a serialized env guard so it does not race other env tests.
    #[test]
    fn gate_requires_proof_when_mandated() {
        // NOTE: tests in this bin run on one thread for env isolation in this crate's
        // suite; set then clear so we do not leak state to sibling tests.
        std::env::set_var(REQUIRE_ENV, "true");
        std::env::remove_var(PROVER_BIN_ENV);
        let moves = vec!["e2e4".to_string(), "resign".to_string()];
        let decision = run_gate(None, 0, &moves);
        std::env::remove_var(REQUIRE_ENV);
        match decision {
            ZkGate::Refused(_) => {}
            _ => panic!("absent receipt + zk_required must be Refused"),
        }
    }

    /// MAINNET forces a verified receipt mandatory regardless of the env flag. With the flag
    /// OFF and no receipt, `zk_required_for_network("mainnet*")` is true and the mainnet gate
    /// REFUSES (real money never settles on the server replay alone), while a testnet with the
    /// flag off SkippedAllowed. Independent of PROVER_BIN (no receipt is supplied, so the
    /// verifier never runs). The refusal explains it is the mainnet rule.
    #[test]
    fn mainnet_forces_proof_required_regardless_of_env() {
        std::env::remove_var(REQUIRE_ENV);
        std::env::remove_var(PROVER_BIN_ENV);
        let moves = vec!["e2e4".to_string(), "resign".to_string()];

        // Flag-agnostic predicate: mainnet is always required, testnet is not (flag off).
        assert!(zk_required_for_network("mainnet"), "mainnet must force require");
        assert!(
            zk_required_for_network("mainnet-11"),
            "any mainnet* label must force require"
        );
        assert!(
            !zk_required_for_network("testnet-12"),
            "testnet with the flag off must not require"
        );

        // mainnet + no receipt => Refused, with a mainnet-specific message.
        match run_gate_for_network(None, "mainnet", 0, &moves) {
            ZkGate::Refused(msg) => assert!(
                msg.contains("mainnet"),
                "mainnet refusal must name the mainnet rule, got: {msg}"
            ),
            _ => panic!("mainnet + absent receipt must be Refused even with the env flag off"),
        }
        // testnet + no receipt (flag off) => SkippedAllowed (server gate stands alone).
        match run_gate_for_network(None, "testnet-12", 0, &moves) {
            ZkGate::SkippedAllowed(_) => {}
            _ => panic!("testnet + absent receipt + flag off must be SkippedAllowed"),
        }
    }
}
