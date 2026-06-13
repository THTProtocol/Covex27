//! covenant_catalog.rs - the single source of truth for what is deployable on Covex
//! and, for any covenant, its HONEST enforcement reality. (Roadmap B4/B6.)
//!
//! `enforcement_reality` is the core anti-"ZK-costume" honesty mechanism the audit
//! called for: every covenant is labeled by HOW its outcome is actually enforced, so
//! the explorer/UI can show truth instead of a blanket "verified" badge, and mainnet
//! can gate the weak ones. The labels, from strongest to weakest:
//!
//!   OnChain        - Kaspa consensus enforces the spend condition (a P2SH script).
//!                    No oracle, no trust. The four covenant_builder primitives
//!                    (singlesig / hashlock / timelock / multisig) are all OnChain.
//!   Hybrid         - a real on-chain script gates release, but an oracle/data feed
//!                    supplies an input the script checks (e.g. an oracle Schnorr sig
//!                    verified by OpCheckSig). Trust the signer set, not pure math.
//!                    (Reserved for the on-chain-oracle-unlock work, roadmap D1.)
//!   OracleAttested - the OUTCOME is asserted by the Covex oracle's (real BIP340)
//!                    signature, but funds are NOT yet script-gated to it; they move
//!                    by an ordinary transaction. Trust the oracle. (Games, prediction.)
//!   Decorative     - no enforcement: a metadata/marker covenant (the legacy self-pay
//!                    + aa20 payload). The chain enforces nothing about the outcome.

use axum::{routing::get, Json, Router};

use crate::covenant_types::CovenantCategory;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EnforcementReality {
    OnChain,
    Hybrid,
    OracleAttested,
    Decorative,
}

impl EnforcementReality {
    pub fn as_str(&self) -> &'static str {
        match self {
            EnforcementReality::OnChain => "on-chain",
            EnforcementReality::Hybrid => "hybrid",
            EnforcementReality::OracleAttested => "oracle-attested",
            EnforcementReality::Decorative => "decorative",
        }
    }

    /// Short, honest human description of what the label guarantees.
    pub fn description(&self) -> &'static str {
        match self {
            EnforcementReality::OnChain => {
                "Kaspa consensus enforces the spend condition (script-locked). No oracle, no trust."
            }
            EnforcementReality::Hybrid => {
                "An on-chain script gates release but checks an oracle-supplied input."
            }
            EnforcementReality::OracleAttested => {
                "The outcome is asserted by the Covex oracle's signature; funds are not script-gated to it yet."
            }
            EnforcementReality::Decorative => {
                "Metadata only. The chain does not enforce the outcome."
            }
        }
    }
}

/// Map a script-derived category to its honest enforcement reality.
///
/// CONSERVATIVE BY DESIGN: only the categories that come from genuine Kaspa script
/// patterns (P2SH structure, OpCheckMultiSig, hash-op + CLTV, locktime custody) are
/// called OnChain. The game/oracle categories are OracleAttested. Everything else -
/// the aa20-payload "logic lives in metadata" classes - is Decorative, because the
/// chain enforces nothing about those outcomes. We never upgrade a covenant's trust
/// label on a guess.
pub fn reality_for_category(cat: CovenantCategory) -> EnforcementReality {
    match cat {
        // Real script-enforced patterns.
        CovenantCategory::P2sh
        | CovenantCategory::Multisig
        | CovenantCategory::AtomicSwap
        | CovenantCategory::Vesting => EnforcementReality::OnChain,
        // Outcome asserted by the oracle / a proof; funds not script-gated yet.
        CovenantCategory::VerifiableSkill
        | CovenantCategory::Predictive
        | CovenantCategory::Oracle
        | CovenantCategory::ZK => EnforcementReality::OracleAttested,
        // Metadata-only covenants.
        _ => EnforcementReality::Decorative,
    }
}

/// Classify a covenant's enforcement reality from its on-chain script (best effort).
pub fn reality_for_script(script_hex: &str) -> EnforcementReality {
    reality_for_category(CovenantCategory::from_script_ops(script_hex))
}

/// A deployable covenant type the wizard can build, with its honest reality and the
/// parameters it needs. The four P2SH primitives are produced by covenant_builder.
pub struct CatalogEntry {
    pub id: &'static str,
    pub label: &'static str,
    pub category: &'static str,
    pub reality: EnforcementReality,
    pub builder: &'static str,
    pub params: &'static [&'static str],
    pub summary: &'static str,
}

pub const CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "p2sh_singlesig",
        label: "Single-key P2SH",
        category: "P2SH Commitments",
        reality: EnforcementReality::OnChain,
        builder: "covenant_builder",
        params: &["stake_kas"],
        summary: "Funds lock to a script hash, spendable only by the key holder. The minimal real covenant.",
    },
    CatalogEntry {
        id: "p2sh_hashlock",
        label: "Hashlock (conditional release)",
        category: "Atomic Swaps & HTLC",
        reality: EnforcementReality::OnChain,
        builder: "covenant_builder",
        params: &["stake_kas", "preimage_hex"],
        summary: "Release requires revealing a secret preimage plus a signature. The HTLC building block.",
    },
    CatalogEntry {
        id: "p2sh_timelock",
        label: "Absolute timelock (CLTV)",
        category: "Vesting & Timelocks",
        reality: EnforcementReality::OnChain,
        builder: "covenant_builder",
        params: &["stake_kas", "lock_daa"],
        summary: "Funds are spendable only once the chain DAA score reaches lock_daa. Vesting, dispute windows.",
    },
    CatalogEntry {
        id: "p2sh_multisig",
        label: "N-of-M multisig",
        category: "Multi-sig",
        reality: EnforcementReality::OnChain,
        builder: "covenant_builder",
        params: &["stake_kas", "pubkeys_hex", "required"],
        summary: "Release requires `required` of M listed keys. DAO treasuries, 2-of-3 escrow.",
    },
    CatalogEntry {
        id: "oracle_game",
        label: "Oracle-resolved game / market",
        category: "Verifiable Games (ZK/Oracle)",
        reality: EnforcementReality::OracleAttested,
        builder: "oracle",
        params: &["circuit_type", "stake_kas"],
        summary: "Outcome is signed by the Covex oracle (real BIP340). Funds are not script-gated to the sig yet (roadmap D1).",
    },
    CatalogEntry {
        id: "silverscript_marker",
        label: "SilverScript / metadata covenant",
        category: "General",
        reality: EnforcementReality::Decorative,
        builder: "signer",
        params: &["script_hex"],
        summary: "A metadata/marker covenant. The chain does not enforce the outcome. Not for value at stake.",
    },
];

async fn catalog_handler() -> Json<serde_json::Value> {
    let entries: Vec<serde_json::Value> = CATALOG
        .iter()
        .map(|e| {
            serde_json::json!({
                "id": e.id,
                "label": e.label,
                "category": e.category,
                "enforcement_reality": e.reality.as_str(),
                "reality_description": e.reality.description(),
                "builder": e.builder,
                "params": e.params,
                "summary": e.summary,
            })
        })
        .collect();
    Json(serde_json::json!({
        "realities": [
            { "id": "on-chain", "description": EnforcementReality::OnChain.description() },
            { "id": "hybrid", "description": EnforcementReality::Hybrid.description() },
            { "id": "oracle-attested", "description": EnforcementReality::OracleAttested.description() },
            { "id": "decorative", "description": EnforcementReality::Decorative.description() },
        ],
        "catalog": entries,
    }))
}

pub fn catalog_routes() -> Router {
    Router::new().route("/covenant/catalog", get(catalog_handler))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_p2sh_is_onchain() {
        // The exact aa20<32-byte hash>87 P2SH pattern (what covenant_builder emits).
        let hash = "11".repeat(32);
        let p2sh = format!("aa20{hash}87");
        assert_eq!(reality_for_script(&p2sh), EnforcementReality::OnChain);
    }

    #[test]
    fn game_payload_is_oracle_attested_not_onchain() {
        // A long aa20 game payload with an OP_1 marker classifies as VerifiableSkill.
        let payload = format!("aa20{}51{}", "ab".repeat(50), "cd".repeat(20));
        let r = reality_for_script(&payload);
        assert!(
            matches!(r, EnforcementReality::OracleAttested | EnforcementReality::Decorative),
            "a game payload must never be labeled OnChain (got {:?})",
            r
        );
        assert_ne!(r, EnforcementReality::OnChain);
    }

    #[test]
    fn empty_or_plain_is_decorative() {
        assert_eq!(reality_for_script(""), EnforcementReality::Decorative);
    }

    #[test]
    fn catalog_has_the_four_onchain_primitives() {
        let onchain: Vec<&str> = CATALOG
            .iter()
            .filter(|e| e.reality == EnforcementReality::OnChain)
            .map(|e| e.id)
            .collect();
        for id in ["p2sh_singlesig", "p2sh_hashlock", "p2sh_timelock", "p2sh_multisig"] {
            assert!(onchain.contains(&id), "missing OnChain primitive {id}");
        }
    }
}
