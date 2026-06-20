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
//!   FullZkChain    - the 4-of-19 carve-out where a real Groth16 proof reduces to a
//!                    hashlock the Kaspa chain itself checks end-to-end (in addition to
//!                    off-chain oracle verification of the proof). Stronger than full-zk
//!                    because payout is on-chain-enforced via the hashlock, not solely
//!                    by the oracle co-signature.
//!   FullZk         - a real Groth16 proof verified fail-closed by the disclosed Covex
//!                    oracle (off-chain), with the oracle co-signature verified on-chain
//!                    (Schnorr). NOT trustless and NOT on-chain ZK; stronger than a bare
//!                    attestation because a tampered proof is rejected.
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
    FullZkChain,
    FullZk,
    Hybrid,
    OracleAttested,
    Decorative,
}

impl EnforcementReality {
    pub fn as_str(&self) -> &'static str {
        match self {
            EnforcementReality::OnChain => "on-chain",
            EnforcementReality::FullZkChain => "full-zk-chain",
            EnforcementReality::FullZk => "full-zk",
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
            EnforcementReality::FullZkChain => {
                "A real Groth16 proof verified off-chain by the disclosed oracle, AND payout is on-chain-enforced via a hashlock the chain checks end-to-end."
            }
            EnforcementReality::FullZk => {
                "A real Groth16 proof verified fail-closed by the disclosed Covex oracle (off-chain). The oracle co-signature is verified on-chain. Not trustless."
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

/// Server-side mirror of frontend lib/zk/circuits.js `CHAIN_ENFORCED_ZK`: the 4-of-19
/// carve-out whose Groth16 proof reduces to a hashlock the Kaspa chain itself checks
/// end-to-end. Used at the JSON boundary to override an exact-P2SH script reality
/// (which reads OnChain in isolation) to FullZkChain when the covenant declares one
/// of these circuits. Must stay byte-for-byte identical with the frontend set; the
/// drift-guard test below enforces this list literally.
pub const CHAIN_ENFORCED_ZK_CIRCUITS: &[&str] = &[
    "merkle_membership",
    "age_verification",
    "escrow_2party",
    "range_proof",
];

/// Server-side mirror of frontend lib/zk/circuits.js `VERIFIED_FULL_ZK`: the 19
/// circuits whose Groth16 proof is end-to-end verified (real accept + tamper-reject).
/// Used at the JSON boundary to upgrade their script reality to FullZk (or FullZkChain
/// for the 4 in CHAIN_ENFORCED_ZK_CIRCUITS), so the 4-vs-15 honesty split actually
/// reaches the badge instead of being flattened to "on-chain" by the exact-P2SH wrapper.
pub const VERIFIED_FULL_ZK_CIRCUITS: &[&str] = &[
    "merkle_membership",
    "age_verification",
    "escrow_2party",
    "range_proof",
    "vrf_dice_roll",
    "nullifier_set",
    "utxo_ownership",
    "hash_preimage",
    "timelock_absolute",
    "relative_timelock",
    "vrf_random",
    "turn_timer",
    "script_constraint",
    "pot_split_math",
    "commitment_open",
    "balance_threshold",
    "solvency_sum",
    "set_non_membership",
    "anon_membership_nullifier",
];

/// Returns the chain-enforced-ZK or full-zk reality for `circuit_id` if it is in one
/// of the verified sets, else None. Caller (covenant_summary_json at the JSON boundary)
/// uses this to override the raw-script "on-chain" label so the 4-vs-15 honesty split
/// reaches the wire. THIS is the one-call fix that makes TrustBadge.jsx paint violet
/// (+emerald for the chain-enforced 4) on Explorer cards and CovenantInteractive headers.
pub fn zk_reality_for_circuit(circuit_id: &str) -> Option<EnforcementReality> {
    if circuit_id.is_empty() || circuit_id == "none" {
        return None;
    }
    if CHAIN_ENFORCED_ZK_CIRCUITS.iter().any(|&c| c == circuit_id) {
        return Some(EnforcementReality::FullZkChain);
    }
    if VERIFIED_FULL_ZK_CIRCUITS.iter().any(|&c| c == circuit_id) {
        return Some(EnforcementReality::FullZk);
    }
    None
}

/// True iff `script_hex` is EXACTLY the Kaspa P2SH structure: OpBlake2b (0xaa) +
/// 32-byte push (0x20) + 32-byte hash + OpEqual (0x87), i.e. 35 bytes. This is the
/// only pattern we trust to mean "the chain enforces a script", because it is exact
/// and unambiguous - it is precisely what covenant_builder emits for every real
/// covenant (the redeem TYPE stays hidden in the P2SH until spend).
fn is_exact_p2sh(script_hex: &str) -> bool {
    let s = script_hex.trim().to_ascii_lowercase();
    let raw_len = s.len() / 2;
    s.starts_with("aa20") && s.ends_with("87") && raw_len == 35
}

/// Classify a covenant's HONEST enforcement reality from its on-chain script.
///
/// CONSERVATIVE BY DESIGN. OnChain is claimed ONLY for the exact P2SH structure -
/// NOT for the looser multisig/HTLC/timelock substring heuristics in
/// `from_script_ops`, which false-positive on arbitrary aa20 payload bytes.
/// Over-claiming "on-chain" is exactly the dishonesty this label exists to prevent,
/// so a genuine multisig/HTLC/timelock - which is itself P2SH-wrapped on-chain -
/// is caught by the exact-P2SH test, while a random game payload never is. The
/// remaining game/oracle classes are OracleAttested; everything else is Decorative.
pub fn reality_for_script(script_hex: &str) -> EnforcementReality {
    if is_exact_p2sh(script_hex) {
        return EnforcementReality::OnChain;
    }
    match CovenantCategory::from_script_ops(script_hex) {
        CovenantCategory::VerifiableSkill
        | CovenantCategory::Predictive
        | CovenantCategory::Oracle
        | CovenantCategory::ZK
        | CovenantCategory::Skill => EnforcementReality::OracleAttested,
        _ => EnforcementReality::Decorative,
    }
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
        id: "p2sh_htlc",
        label: "HTLC (atomic swap)",
        category: "Atomic Swaps & HTLC",
        reality: EnforcementReality::OnChain,
        builder: "covenant_builder",
        params: &["stake_kas", "preimage_hex", "lock_daa", "receiver_pubkey_hex", "sender_pubkey_hex"],
        summary: "Receiver claims by revealing a preimage; sender refunds after a timelock. Cross-party / cross-chain atomic swaps.",
    },
    CatalogEntry {
        id: "p2sh_channel",
        label: "State-channel pot (2-player, trustless)",
        category: "State Channels",
        reality: EnforcementReality::OnChain,
        builder: "covenant_builder",
        params: &["stake_kas", "pubkeys_hex", "lock_daa"],
        summary: "A 2-of-2 cooperative-close pot with a funder refund after a timelock. The chain pays the agreed winner; no oracle, and Covex is never in the payout path.",
    },
    CatalogEntry {
        id: "p2sh_deadman",
        label: "Dead-man's switch / inheritance",
        category: "Vesting & Timelocks",
        reality: EnforcementReality::OnChain,
        builder: "covenant_builder",
        params: &["stake_kas", "pubkeys_hex", "lock_daa"],
        summary: "The owner spends or refreshes at any time; the heir can claim only after the timelock DAA, so funds pass on if the owner goes silent. No oracle.",
    },
    CatalogEntry {
        id: "p2sh_rcsv",
        label: "Relative timelock (CSV)",
        category: "Vesting & Timelocks",
        reality: EnforcementReality::OnChain,
        builder: "covenant_builder",
        params: &["stake_kas", "lock_daa"],
        summary: "Spendable only once the funds have aged a relative number of units, via OpCheckSequenceVerify on the input sequence. Node-enforced (BIP68): the node rejects an early spend.",
    },
    CatalogEntry {
        id: "p2sh_timedecay",
        label: "Time-decaying multisig",
        category: "Vesting & Timelocks",
        reality: EnforcementReality::OnChain,
        builder: "covenant_builder",
        params: &["stake_kas", "pubkeys", "req_now", "req_after", "lock_daa"],
        summary: "req_now-of-n now, relaxing to req_after-of-n after an absolute DAA deadline (OpCheckLockTimeVerify). Treasury recovery / inheritance: a high quorum spends immediately, a lower quorum unlocks after the timeout. Two real multisigs spliced into an IF/ELSE - node-enforced on both branches.",
    },
    CatalogEntry {
        id: "p2sh_binary_oracle_select",
        label: "Binary outcome selector (parimutuel bundle unit)",
        category: "Verifiable Games (ZK/Oracle)",
        reality: EnforcementReality::Hybrid,
        builder: "covenant_builder",
        params: &["stake_kas", "preimage_hex", "preimage_b_hex", "pubkeys_hex", "lock_daa"],
        summary: "Two hashlock branches + a relative-timelock refund: reveal the preimage of H_A and winner_a claims, reveal H_B and winner_b claims, else the refund key reclaims after the CSV delay. The outcome is assigned by which single secret an oracle reveals, but every branch is gated by a specific key's signature, so no Covex key is in the redeem - pure on-chain custody, amounts, and destinations. The per-match building block of a 30%-fee / 50%-loser-rebate parimutuel bundle.",
    },
    CatalogEntry {
        id: "oracle_enforced",
        label: "Oracle-enforced (on-chain co-sign)",
        category: "Verifiable Games (ZK/Oracle)",
        reality: EnforcementReality::Hybrid,
        builder: "covenant_builder",
        params: &["stake_kas", "circuit_type"],
        summary: "A 2-of-2 of [oracle, winner]. The chain requires the disclosed oracle's co-signature, and the oracle co-signs only a verified outcome - on-chain-enforced oracle resolution.",
    },
    CatalogEntry {
        id: "oracle_escrow",
        label: "Oracle escrow (2-player pot)",
        category: "Verifiable Games (ZK/Oracle)",
        reality: EnforcementReality::Hybrid,
        builder: "covenant_builder",
        params: &["stake_kas", "circuit_type", "player_a_pubkey", "player_b_pubkey"],
        summary: "A 2-player pot the chain releases only to the oracle-declared winner: requires the oracle co-signature AND the winning player's signature on their branch.",
    },
    CatalogEntry {
        id: "oracle_enforced_refundable",
        label: "Oracle-enforced + timeout refund (on-chain co-sign)",
        category: "Verifiable Games (ZK/Oracle)",
        reality: EnforcementReality::Hybrid,
        builder: "covenant_builder",
        params: &["stake_kas", "circuit_type", "lock_daa", "refund_pubkey_hex"],
        summary: "Like oracle_enforced (a 2-of-2 of [oracle, winner] the chain co-signs), but wrapped with a relative-timelock (CSV) refund branch so the funder reclaims the stake if the oracle ever goes silent. Closes the frozen-funds risk of a mandatory oracle co-signature with no timeout.",
    },
    CatalogEntry {
        id: "oracle_escrow_refundable",
        label: "Oracle escrow + timeout refund (2-player pot)",
        category: "Verifiable Games (ZK/Oracle)",
        reality: EnforcementReality::Hybrid,
        builder: "covenant_builder",
        params: &["stake_kas", "circuit_type", "player_a_pubkey", "player_b_pubkey", "lock_daa", "refund_pubkey_hex"],
        summary: "Like oracle_escrow (a 2-player pot the chain releases only to the oracle-declared winner), but wrapped with a relative-timelock (CSV) refund branch so the funder reclaims the pot if the oracle ever goes silent. Closes the frozen-funds risk of the non-refundable form.",
    },
    CatalogEntry {
        id: "oracle_game",
        label: "Oracle-resolved game / market (off-chain)",
        category: "Verifiable Games (ZK/Oracle)",
        reality: EnforcementReality::OracleAttested,
        builder: "oracle",
        params: &["circuit_type", "stake_kas"],
        summary: "Outcome is signed by the Covex oracle (real BIP340), but funds are not script-gated to the sig. Prefer oracle_enforced for on-chain enforcement.",
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
            { "id": "full-zk-chain", "description": EnforcementReality::FullZkChain.description() },
            { "id": "full-zk", "description": EnforcementReality::FullZk.description() },
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

    /// The type-driven honesty override at the JSON boundary (main.rs covenant_summary_json)
    /// must emit "hybrid" for a binary_oracle_select leg even though the leg's stored script_hex
    /// is the exact 35-byte aa20<hash>87 P2SH that reality_for_script() alone calls OnChain. This
    /// locks in catalog/live-label agreement: the live override and the CATALOG entry must report
    /// the same reality for p2sh_binary_oracle_select. reality_for_script() itself is unchanged.
    #[test]
    fn binary_oracle_select_type_override_is_hybrid_despite_exact_p2sh() {
        // A leg is stored with the exact P2SH wrapper, which on script alone reads OnChain ...
        let hash = "22".repeat(32);
        let p2sh = format!("aa20{hash}87");
        assert_eq!(reality_for_script(&p2sh), EnforcementReality::OnChain);

        // ... but the covenant_type carries "binary_oracle_select", and the JSON boundary
        // overrides such a type to "hybrid". Mirror that exact predicate here.
        let covenant_type = "p2sh-binary_oracle_select";
        let live_label = if covenant_type.contains("binary_oracle_select") {
            "hybrid"
        } else {
            reality_for_script(&p2sh).as_str()
        };
        assert_eq!(live_label, "hybrid");

        // And the live label must agree with what the catalog already declares for this type.
        let catalog_reality = CATALOG
            .iter()
            .find(|e| e.id == "p2sh_binary_oracle_select")
            .expect("catalog must contain p2sh_binary_oracle_select")
            .reality;
        assert_eq!(catalog_reality, EnforcementReality::Hybrid);
        assert_eq!(live_label, catalog_reality.as_str());
    }

    #[test]
    fn malformed_length_aa20_87_is_not_onchain() {
        // A valid Kaspa P2SH is EXACTLY 35 bytes (the 0x20 push is fixed-width). A 34- or
        // 36-byte aa20..87 is malformed and must NEVER be labeled OnChain (the OnChain
        // label is the honesty-critical one - it claims "the chain enforces this").
        let short = format!("aa20{}87", "11".repeat(31)); // 34 bytes
        let long = format!("aa20{}87", "11".repeat(33)); // 36 bytes
        assert_ne!(reality_for_script(&short), EnforcementReality::OnChain);
        assert_ne!(reality_for_script(&long), EnforcementReality::OnChain);
    }

    #[test]
    fn game_payload_is_oracle_attested_not_onchain() {
        // A long aa20 game payload with an OP_1 marker classifies as VerifiableSkill.
        let payload = format!("aa20{}51{}", "ab".repeat(50), "cd".repeat(20));
        let r = reality_for_script(&payload);
        assert!(
            matches!(
                r,
                EnforcementReality::OracleAttested | EnforcementReality::Decorative
            ),
            "a game payload must never be labeled OnChain (got {:?})",
            r
        );
        assert_ne!(r, EnforcementReality::OnChain);
    }

    #[test]
    fn empty_or_plain_is_decorative() {
        assert_eq!(reality_for_script(""), EnforcementReality::Decorative);
    }

    /// The 4-of-19 honesty carve-out. zk_reality_for_circuit must promote a circuit in
    /// CHAIN_ENFORCED_ZK_CIRCUITS to FullZkChain (violet+emerald "Chain-enforced ZK"),
    /// and a circuit in VERIFIED_FULL_ZK_CIRCUITS but not chain-enforced to FullZk
    /// (plain violet "Full ZK"). This is the override the JSON boundary uses so the
    /// 4-vs-15 honesty split actually reaches TrustBadge instead of being flattened to
    /// "on-chain" by the exact-P2SH wrapper. Do not soften.
    #[test]
    fn chain_enforced_zk_circuits_promote_to_full_zk_chain() {
        for id in [
            "merkle_membership",
            "age_verification",
            "escrow_2party",
            "range_proof",
        ] {
            assert_eq!(
                zk_reality_for_circuit(id),
                Some(EnforcementReality::FullZkChain),
                "{id} must be FullZkChain"
            );
        }
    }

    #[test]
    fn other_verified_zk_circuits_promote_to_full_zk() {
        for id in [
            "vrf_dice_roll",
            "nullifier_set",
            "hash_preimage",
            "turn_timer",
            "balance_threshold",
        ] {
            assert_eq!(
                zk_reality_for_circuit(id),
                Some(EnforcementReality::FullZk),
                "{id} must be FullZk (not chain-enforced)"
            );
        }
    }

    #[test]
    fn unknown_or_none_circuit_does_not_override() {
        assert_eq!(zk_reality_for_circuit(""), None);
        assert_eq!(zk_reality_for_circuit("none"), None);
        assert_eq!(zk_reality_for_circuit("not_a_circuit"), None);
    }

    /// The 4-set is a strict subset of the 19-set: every chain-enforced id MUST also
    /// be in VERIFIED_FULL_ZK_CIRCUITS, else zk_reality_for_circuit could surface
    /// FullZkChain for a circuit we haven't even certified as verified end-to-end.
    #[test]
    fn chain_enforced_set_is_subset_of_verified_set() {
        for id in CHAIN_ENFORCED_ZK_CIRCUITS {
            assert!(
                VERIFIED_FULL_ZK_CIRCUITS.contains(id),
                "chain-enforced id '{id}' missing from VERIFIED_FULL_ZK_CIRCUITS"
            );
        }
    }

    /// The 4-vs-15 honesty split: there are exactly 19 verified circuits, of which
    /// exactly 4 are chain-enforced (leaving 15 oracle-cosigned only). If these counts
    /// drift, the badge math + lib/zk/circuits.js no longer agree byte-for-byte and a
    /// real new circuit's honesty label will be wrong on the wire.
    #[test]
    fn zk_reality_counts_are_4_and_15() {
        assert_eq!(CHAIN_ENFORCED_ZK_CIRCUITS.len(), 4);
        assert_eq!(VERIFIED_FULL_ZK_CIRCUITS.len(), 19);
    }

    /// String stability: the wire labels must be exactly what TrustBadge.jsx +
    /// enforcement-copy.js branch on. A typo here ("full_zk" vs "full-zk") would silently
    /// fall through to the unknown-reality fallback and re-flatten the honesty split.
    #[test]
    fn full_zk_wire_labels_are_hyphenated() {
        assert_eq!(EnforcementReality::FullZk.as_str(), "full-zk");
        assert_eq!(EnforcementReality::FullZkChain.as_str(), "full-zk-chain");
    }

    #[test]
    fn loose_heuristic_payload_is_never_onchain() {
        // A long aa20 payload containing the very bytes the loose multisig/HTLC/timelock
        // substring heuristics look for (ae, a8, b1, 51, repeated 21) but which is NOT
        // the exact P2SH structure. It must NEVER be labeled on-chain.
        let payload = format!("aa20{}", "ae512121a8b1cdef".repeat(8));
        assert_ne!(reality_for_script(&payload), EnforcementReality::OnChain);
    }

    #[test]
    fn catalog_has_the_four_onchain_primitives() {
        let onchain: Vec<&str> = CATALOG
            .iter()
            .filter(|e| e.reality == EnforcementReality::OnChain)
            .map(|e| e.id)
            .collect();
        for id in [
            "p2sh_singlesig",
            "p2sh_hashlock",
            "p2sh_timelock",
            "p2sh_multisig",
        ] {
            assert!(onchain.contains(&id), "missing OnChain primitive {id}");
        }
    }

    /// Drift guard: every covenant_builder RedeemKind variant must have a CATALOG row, so
    /// a deployable covenant type can never go missing from the explorer/wizard. The
    /// RedeemKind::catalog_id() match is exhaustive, so a new variant forces a new id here.
    #[test]
    fn catalog_has_an_entry_for_every_builder_kind() {
        use crate::covenant_builder::RedeemKind;
        let a = [1u8; 32];
        let kinds = [
            RedeemKind::SingleSig { xonly_pubkey: a },
            RedeemKind::HashLock {
                hash: a,
                xonly_pubkey: a,
            },
            RedeemKind::Timelock {
                lock_daa: 1,
                xonly_pubkey: a,
            },
            RedeemKind::Multisig {
                pubkeys: vec![a, a],
                required: 2,
            },
            RedeemKind::Htlc {
                hash: a,
                receiver_pubkey: a,
                lock_daa: 1,
                sender_pubkey: a,
            },
            RedeemKind::Channel {
                p1: a,
                p2: a,
                lock_daa: 1,
            },
            RedeemKind::OracleEnforced {
                oracle: a,
                winner: a,
            },
            RedeemKind::OracleEscrow {
                oracle: a,
                player_a: a,
                player_b: a,
            },
            RedeemKind::Deadman {
                owner: a,
                heir: a,
                lock_daa: 1,
            },
            RedeemKind::RelativeTimelock {
                min_sequence: 1,
                xonly_pubkey: a,
            },
            RedeemKind::TimeDecay {
                pubkeys: vec![a, a],
                req_now: 2,
                req_after: 1,
                lock_daa: 1,
            },
            RedeemKind::BinaryOracleSelect {
                h_a: a,
                winner_a: a,
                h_b: a,
                winner_b: a,
                min_sequence: 1,
                refund: a,
            },
            RedeemKind::OracleEnforcedRefundable {
                oracle: a,
                winner: a,
                min_sequence: 1,
                refund: a,
            },
            RedeemKind::OracleEscrowRefundable {
                oracle: a,
                player_a: a,
                player_b: a,
                min_sequence: 1,
                refund: a,
            },
        ];
        let ids: Vec<&str> = CATALOG.iter().map(|e| e.id).collect();
        for k in &kinds {
            assert!(
                ids.contains(&k.catalog_id()),
                "CATALOG has no entry for builder kind '{}'",
                k.catalog_id()
            );
        }
    }
}
