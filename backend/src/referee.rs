//! Game referee: a secret-revealer for the hashlock games money path.
//!
//! THE REFEREE IS NOT A COVENANT SIGNER. Its key NEVER appears in any redeem
//! script. The referee holds a single 32-byte secret and, from it, derives a
//! per-outcome secret for each game pot. At LOCK time the games path commits the
//! two outcome HASHLOCKS (blake2b256 of each outcome secret) into a
//! binary_oracle_select covenant `[winner_a, winner_b, refund]`. At SETTLE time,
//! once the server-authoritative game engine has decided the winner
//! (`game_pot_outcome`, fail-closed), the referee RE-DERIVES and REVEALS only the
//! winning outcome's secret. The winner then redeems the covenant with that secret
//! plus THEIR OWN OpCheckSig - the referee contributes no signature on the spend.
//!
//! This mirrors the proven external-resolver `binary_oracle_select` market: the
//! chain enforces who can spend (OpBlake2b over the committed hash + the named
//! winner key + a CSV refund to the funder). The referee is a hashlock revealer,
//! not an oracle that co-signs money. A lying-but-live referee could reveal the
//! wrong outcome's secret (collusion residue stated in DEORACLE_PLAN.md); the CSV
//! refund protects only against silence, not a liar. That is strictly better than
//! the legacy oracle_escrow path (where the Covex key was IN the redeem) and is
//! the same trust surface the markets already ship.
//!
//! KEY CONTRACT (`REFEREE_KEY`):
//!   * A 32-byte hex secret (64 hex chars), SEPARATE from `COVEX_ORACLE_KEY`. The
//!     referee secret and the oracle secret must never be the same value or one
//!     subsystem could forge for the other.
//!   * If `REFEREE_KEY` is unset / empty:
//!       - on a TESTNET network: derive a STABLE dev key from a fixed seed (so a
//!         hashlock committed at lock time still matches the secret revealed at
//!         settle across a server restart) and log a warning.
//!       - on MAINNET: FAIL CLOSED (panic on the offending request task only).
//!
//! Determinism: `outcome_secret(domain, outcome)` is a pure function of the
//! configured secret, so the same (domain, outcome) always yields the same secret
//! and the same hashlock. `domain` is a stable per-pot identifier known at LOCK
//! time (the match covenant_id) so a secret minted for match X can never satisfy
//! match Y's hash (request_id-style binding).

use crate::covenant_builder::blake2b256;

/// Placeholder sentinel: refuse to operate if someone sets REFEREE_KEY to this.
const REFEREE_KEY_PLACEHOLDER: &str = "SET_COVEX_REFEREE_KEY__no_referee_key_is_baked_into_source";

/// A fixed, NON-SECRET seed used ONLY to derive a stable testnet dev referee key
/// when REFEREE_KEY is unset. It is deliberately obvious that this is a throwaway
/// testnet value: anyone can re-derive it, so a testnet referee built on it offers
/// NO real secrecy. Mainnet never reaches this path (it fails closed instead).
const REFEREE_DEV_SEED: &[u8] =
    b"covex-referee-dev-seed:v1:testnet-only:no-secrecy:set-REFEREE_KEY-for-real";

/// The configured referee secret bytes (32 bytes), fail-closed.
///
/// `REFEREE_KEY` (64-hex) is the source of truth. When it is unset:
///   * testnet -> a STABLE dev secret derived from REFEREE_DEV_SEED (warn).
///   * mainnet -> panic (fail closed): no referee secret may be baked into source,
///     and a publicly-derivable testnet seed must never secure real money.
///
/// Panicking aborts only the offending request task, not the whole server (the
/// same posture as `oracle::oracle_key_bytes`).
fn referee_secret_bytes(network: &str) -> [u8; 32] {
    match std::env::var("REFEREE_KEY") {
        Ok(v) if !v.trim().is_empty() => {
            let raw = v.trim().to_string();
            if raw == REFEREE_KEY_PLACEHOLDER {
                panic!(
                    "REFEREE_KEY is set to the placeholder sentinel - refusing to operate with a \
                     non-secret value. Provide a real 64-hex referee key."
                );
            }
            let bytes =
                hex::decode(&raw).expect("REFEREE_KEY must be valid hex (64 hex chars / 32 bytes)");
            assert_eq!(
                bytes.len(),
                32,
                "REFEREE_KEY must decode to exactly 32 bytes (64 hex chars)"
            );
            // Defense in depth: the referee secret must never equal the oracle
            // secret, or a compromise of one would compromise both subsystems.
            if std::env::var("COVEX_ORACLE_KEY").as_deref() == Ok(raw.as_str()) {
                panic!(
                    "REFEREE_KEY must NOT equal COVEX_ORACLE_KEY: the game referee and the oracle \
                     are separate trust roots and must hold distinct secrets."
                );
            }
            let mut out = [0u8; 32];
            out.copy_from_slice(&bytes);
            out
        }
        _ => {
            if crate::covenant_builder::is_mainnet(network) {
                panic!(
                    "REFEREE_KEY is not set: the game referee refuses to derive a secret on \
                     mainnet (fail-closed). A publicly-derivable testnet seed must never secure \
                     real money. Set REFEREE_KEY=<64-hex> in this environment."
                );
            }
            // Testnet: derive a STABLE dev secret so a hashlock committed at lock
            // time still matches the secret revealed at settle across a restart.
            tracing::warn!(
                "REFEREE_KEY is not set: deriving a STABLE testnet dev referee secret from a \
                 PUBLIC seed (no secrecy). This is for testnet development only; set REFEREE_KEY \
                 to a real 64-hex secret for any real-money path."
            );
            blake2b256(REFEREE_DEV_SEED)
        }
    }
}

/// The per-outcome secret for a game pot: deterministic so it can be re-derived at
/// settle time without storing it. `domain` is the stable per-pot identifier known
/// at LOCK time (the match covenant_id), so a secret minted for one match cannot
/// satisfy another match's hash (request_id-style binding). `outcome` is 0
/// (player1 / outcome A wins) or 1 (player2 / outcome B wins).
///
/// secret = blake2b256( referee_secret_bytes || domain.as_bytes() || (outcome as u8) )
pub fn outcome_secret(network: &str, domain: &str, outcome: u32) -> [u8; 32] {
    let secret = referee_secret_bytes(network);
    let mut preimage: Vec<u8> = Vec::with_capacity(32 + domain.len() + 1);
    preimage.extend_from_slice(&secret);
    preimage.extend_from_slice(domain.as_bytes());
    // A single byte distinguishes the two outcomes; the engine only ever produces
    // 0 or 1, but cast defensively so any caller value still maps deterministically.
    preimage.push((outcome & 0xff) as u8);
    blake2b256(&preimage)
}

/// The ON-CHAIN committed hashlock for a game pot outcome:
/// blake2b256( outcome_secret(domain, outcome) ). This is exactly what the
/// binary_oracle_select redeem's OpBlake2b compares the revealed secret against
/// (the same blake2b256 used everywhere on-chain), so revealing `outcome_secret`
/// satisfies this hash and nothing else.
pub fn outcome_hashlock(network: &str, domain: &str, outcome: u32) -> [u8; 32] {
    blake2b256(&outcome_secret(network, domain, outcome))
}

/// Hex of the referee's per-outcome secret (the value the winner reveals at spend).
pub fn outcome_secret_hex(network: &str, domain: &str, outcome: u32) -> String {
    hex::encode(outcome_secret(network, domain, outcome))
}

/// Hex of the on-chain hashlock for a game pot outcome.
pub fn outcome_hashlock_hex(network: &str, domain: &str, outcome: u32) -> String {
    hex::encode(outcome_hashlock(network, domain, outcome))
}

/// The referee's BIP340 x-only public key (hex), FOR DISCLOSURE ONLY. It is NOT
/// used in any redeem script and never co-signs a spend; it exists so a verifier
/// can identify which referee is committing the hashlocks for a given network.
/// Derived the same way the oracle derives its identity (hash the configured
/// secret to a valid secp256k1 scalar).
pub fn referee_xonly_pubkey_hex(network: &str) -> String {
    use secp256k1::{Keypair, Secp256k1};
    use sha2::{Digest, Sha256};
    let seed = Sha256::digest(referee_secret_bytes(network));
    let kp = Keypair::from_seckey_slice(&Secp256k1::new(), seed.as_slice())
        .expect("hashed referee key is a valid secp256k1 scalar");
    hex::encode(kp.x_only_public_key().0.serialize())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Tests run with REFEREE_KEY unset on a testnet network, so they exercise the
    /// stable dev-secret path. The derivation is deterministic, so determinism /
    /// domain-separation / hashlock relations all hold regardless of the source.
    const NET: &str = "testnet-12";

    /// Determinism: the same (domain, outcome) always yields the same secret and
    /// the same hashlock, so the hash committed at lock time matches the secret
    /// re-derived at settle.
    #[test]
    fn outcome_secret_is_deterministic() {
        let s1 = outcome_secret(NET, "match-abc", 0);
        let s2 = outcome_secret(NET, "match-abc", 0);
        assert_eq!(s1, s2, "outcome_secret must be deterministic");
        let h1 = outcome_hashlock(NET, "match-abc", 0);
        let h2 = outcome_hashlock(NET, "match-abc", 0);
        assert_eq!(h1, h2, "outcome_hashlock must be deterministic");
    }

    /// The hashlock is blake2b256 of the secret (the exact OpBlake2b relation the
    /// redeem enforces on-chain), so revealing the secret satisfies the hash.
    #[test]
    fn hashlock_is_blake2b_of_secret() {
        let s = outcome_secret(NET, "match-xyz", 1);
        let h = outcome_hashlock(NET, "match-xyz", 1);
        assert_eq!(
            h,
            blake2b256(&s),
            "outcome_hashlock(d,o) must equal blake2b256(outcome_secret(d,o))"
        );
    }

    /// Domain separation: a secret minted for match X must NOT satisfy match Y's
    /// hash (request_id-style binding). Different domains => different secrets =>
    /// different hashlocks.
    #[test]
    fn different_domains_are_independent() {
        let sx = outcome_secret(NET, "match-X", 0);
        let sy = outcome_secret(NET, "match-Y", 0);
        assert_ne!(
            sx, sy,
            "secrets for different matches must differ (no cross-match reuse)"
        );
        // And crucially: X's secret must not satisfy Y's hashlock.
        let hy = outcome_hashlock(NET, "match-Y", 0);
        assert_ne!(
            blake2b256(&sx),
            hy,
            "match X's secret must NOT satisfy match Y's hashlock"
        );
    }

    /// Outcome separation: outcome 0 and outcome 1 of the SAME match are distinct,
    /// so revealing the loser's secret never satisfies the winner's branch hash.
    #[test]
    fn different_outcomes_are_independent() {
        let s0 = outcome_secret(NET, "match-Z", 0);
        let s1 = outcome_secret(NET, "match-Z", 1);
        assert_ne!(s0, s1, "outcome 0 and 1 secrets must differ");
        let h0 = outcome_hashlock(NET, "match-Z", 0);
        let h1 = outcome_hashlock(NET, "match-Z", 1);
        assert_ne!(h0, h1, "outcome 0 and 1 hashlocks must differ");
        // The loser's secret must not satisfy the winner's branch hash.
        assert_ne!(
            blake2b256(&s0),
            h1,
            "outcome 0's secret must NOT satisfy outcome 1's hashlock"
        );
    }

    /// The hex helpers agree with the byte helpers.
    #[test]
    fn hex_helpers_match_bytes() {
        assert_eq!(
            outcome_secret_hex(NET, "m", 0),
            hex::encode(outcome_secret(NET, "m", 0))
        );
        assert_eq!(
            outcome_hashlock_hex(NET, "m", 0),
            hex::encode(outcome_hashlock(NET, "m", 0))
        );
    }

    /// The disclosure-only pubkey derives without panicking and is a 32-byte
    /// x-only key (64 hex chars).
    #[test]
    fn referee_pubkey_is_xonly() {
        let pk = referee_xonly_pubkey_hex(NET);
        assert_eq!(pk.len(), 64, "x-only pubkey is 32 bytes / 64 hex chars");
        assert!(hex::decode(&pk).is_ok(), "pubkey hex decodes");
    }

    /// GAP 9 (single-source-of-truth): the referee's mainnet detection now routes
    /// through `crate::covenant_builder::is_mainnet` (the codebase-wide
    /// `starts_with("mainnet")` predicate), not a local re-implementation. This
    /// proves the wiring classifies exactly the strings the referee fail-closed
    /// path depends on: every mainnet-ish label (including the "mainnet-foo"
    /// variant an exact `==` would miss) is mainnet, and the testnets are not.
    #[test]
    fn mainnet_predicate_is_canonical() {
        use crate::covenant_builder::is_mainnet;
        assert!(is_mainnet("mainnet"), "mainnet is mainnet");
        assert!(
            is_mainnet("mainnet-foo"),
            "a mainnet-prefixed variant must also be mainnet (no exact-match bypass)"
        );
        assert!(!is_mainnet("testnet-12"), "testnet-12 is not mainnet");
        assert!(!is_mainnet("testnet-10"), "testnet-10 is not mainnet");
    }
}
