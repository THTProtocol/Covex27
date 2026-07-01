use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CovenantCategory {
    #[serde(rename = "skill")]
    Skill,
    #[serde(rename = "verifiable-skill")]
    VerifiableSkill, // Skill contests with ZK/oracle resolution (chess, poker etc.)
    #[serde(rename = "predictive")]
    Predictive,
    #[serde(rename = "escrow")]
    Escrow,
    #[serde(rename = "tournament")]
    Tournament,
    #[serde(rename = "community-pool")]
    CommunityPool,
    #[serde(rename = "flash")]
    Flash,
    #[serde(rename = "structured")]
    Structured,
    #[serde(rename = "governance")]
    Governance,
    #[serde(rename = "membership-claim")]
    MembershipClaim, // Merkle / range / eligibility claims
    #[serde(rename = "defi")]
    DeFi, // Yield, compounding, lending, pot splits
    #[serde(rename = "oracle")]
    Oracle, // Oracle-attested, VRF, external data
    #[serde(rename = "zk")]
    ZK, // Pure ZK proofs, range, membership without oracle
    #[serde(rename = "p2sh")]
    P2sh,
    #[serde(rename = "vesting")]
    Vesting,
    #[serde(rename = "atomic-swap")]
    AtomicSwap,
    #[serde(rename = "multisig")]
    Multisig,
    #[serde(rename = "general")]
    General,
}

impl CovenantCategory {
    /// Classify a covenant by its script hex payload into rich categories.
    ///
    /// This is used by both the historic crawler and live indexer.
    /// Paid users (BUILDER+) can later override with custom_category via Terminal.
    ///
    /// Enhanced detection for ZK, games, claims (2026 state).
    pub fn from_script_ops(script_hex: &str) -> Self {
        if script_hex.is_empty() {
            return CovenantCategory::General;
        }

        let raw_len = script_hex.len() / 2;
        let has_aa20 = script_hex.contains("aa20");
        let has_aa21 = script_hex.contains("aa21");
        let has_aa22 = script_hex.contains("aa22");
        let has_aa23 = script_hex.contains("aa23");
        let has_opcodes = has_aa20 || has_aa21 || has_aa22 || has_aa23;

        // Pure P2SH commitment: exactly OpBlake2b <32-byte hash> OpEqual.
        // The script's logic is hidden until spend, so it gets its own honest class.
        if script_hex.starts_with("aa20")
            && script_hex.ends_with("87")
            && (34..=36).contains(&raw_len)
        {
            return CovenantCategory::P2sh;
        }

        // Multi-sig: OpCheckMultiSig family present
        if has_opcodes
            && (script_hex.contains("ae") && script_hex.contains("51"))
            && raw_len > 36
            && script_hex.matches("21").count() >= 2
        {
            return CovenantCategory::Multisig;
        }

        // HTLC / atomic swap: hash-op plus locktime verify in one script
        if has_opcodes && script_hex.contains("a8") && script_hex.contains("b1") {
            return CovenantCategory::AtomicSwap;
        }

        // Vesting: extended custody envelope with locktime
        if has_aa21 && script_hex.contains("b1") {
            return CovenantCategory::Vesting;
        }

        // Flash: very short covenant payload (compact one-shot logic, e.g. simple transfers)
        if has_opcodes && raw_len < 80 {
            return CovenantCategory::Flash;
        }

        // aa21 patterns (time-based custody / multi-party)
        if has_aa21 {
            if script_hex.contains("51") && script_hex.contains("52") {
                return CovenantCategory::Governance; // multi-outcome voting / DAO style
            }
            return CovenantCategory::Escrow;
        }

        // aa22 patterns (multi-sig / tournament style)
        if has_aa22 {
            return CovenantCategory::Tournament;
        }

        // aa23 patterns (community pools, lotteries, shared funds)
        if has_aa23 {
            return CovenantCategory::CommunityPool;
        }

        // aa20 = the STANDARD Kaspa P2SH lock (OP_BLAKE2B, push-32, <hash>, OP_EQUAL). The 32-byte
        // script hash is cryptographically OPAQUE until the redeem script is revealed at spend
        // time, so the bytes inside it tell us NOTHING about what the covenant actually does.
        // Classifying it as "Predictive"/"VerifiableSkill"/"Skill" from incidental hash bytes (the
        // presence of 0x51/0x52/0x53) was fabrication - every such "covenant" is really just a P2SH
        // commitment. Label it honestly. The genuine type is only known when the covenant is
        // deployed THROUGH Covex (which records its real type) or its redeem script is revealed.
        if has_aa20 {
            let _ = raw_len;
            return CovenantCategory::P2sh;
        }

        CovenantCategory::General
    }

    /// Quick check if this looks like a raw covenant (any aa2x but no strong category match).
    pub fn is_raw_covenant(script_hex: &str) -> bool {
        let has_op = script_hex.contains("aa20")
            || script_hex.contains("aa21")
            || script_hex.contains("aa22")
            || script_hex.contains("aa23");
        has_op
            && matches!(
                Self::from_script_ops(script_hex),
                CovenantCategory::General | CovenantCategory::Flash
            )
    }

    /// More granular covenant_type used for indexing and API (beyond broad category).
    pub fn covenant_type(script_hex: &str) -> String {
        if script_hex.is_empty() {
            return "unknown".into();
        }
        if script_hex.starts_with("aa20") && script_hex.ends_with("87") {
            return "p2sh-commitment".into();
        }
        if script_hex.contains("a8") && script_hex.contains("b1") {
            return "atomic-swap-htlc".into();
        }
        if script_hex.contains("aa21") && script_hex.contains("b1") {
            return "vesting-covenant".into();
        }
        if script_hex.contains("aa21") {
            if script_hex.contains("51") && script_hex.contains("52") {
                return "governance-covenant".into();
            }
            return "extended-covenant".into();
        }
        if script_hex.contains("aa22") {
            return "multi-sig-covenant".into();
        }
        if script_hex.contains("aa23") {
            return "community-pool-covenant".into();
        }
        if script_hex.contains("aa20") {
            // aa20 commitment we can't further classify from opaque bytes - label honestly as a
            // P2SH commitment rather than guessing "skill"/"verifiable-skill" from random hash bytes.
            return "p2sh-commitment".into();
        }
        // Best-effort for raw / any opcode presence (to surface EVERY covenant from the chain)
        if script_hex.contains("aa20")
            || script_hex.contains("aa21")
            || script_hex.contains("aa22")
            || script_hex.contains("aa23")
        {
            return "raw-covenant".into();
        }
        "generic-covenant".into()
    }

    pub fn label(&self) -> &'static str {
        match self {
            CovenantCategory::Skill => "Skill Contests",
            CovenantCategory::VerifiableSkill => "Verifiable Games (ZK/Oracle)",
            CovenantCategory::Predictive => "Predictive Markets",
            CovenantCategory::Escrow => "Escrow & Custody",
            CovenantCategory::Tournament => "Tournaments",
            CovenantCategory::CommunityPool => "Community Pools",
            CovenantCategory::Flash => "Flash Covenants",
            CovenantCategory::Structured => "Structured Settlement",
            CovenantCategory::Governance => "Governance",
            CovenantCategory::MembershipClaim => "Membership & Claims",
            CovenantCategory::DeFi => "DeFi & Yield",
            CovenantCategory::Oracle => "Oracle & Attestation",
            CovenantCategory::ZK => "ZK Proofs & Claims",
            CovenantCategory::P2sh => "P2SH Commitments",
            CovenantCategory::Vesting => "Vesting & Timelocks",
            CovenantCategory::AtomicSwap => "Atomic Swaps & HTLC",
            CovenantCategory::Multisig => "Multi-sig",
            CovenantCategory::General => "General",
        }
    }

    pub fn raw_label() -> &'static str {
        "Raw / On-chain Covenant (unverified)"
    }
}

/// Disclosure level for covenant transparency
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DisclosureLevel {
    #[serde(rename = "limited")]
    Limited, // FREE/EXPLORER: basic fields only + danger banner
    #[serde(rename = "full")]
    Full, // BUILDER+: full transparency, all fields, verified badge
}

impl DisclosureLevel {
    pub fn from_tier(tier: &str) -> Self {
        match tier {
            "FREE" | "EXPLORER" => DisclosureLevel::Limited,
            _ => DisclosureLevel::Full,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CovenantRecord {
    pub tx_id: String,
    pub address: String,
    pub amount_kaspa: f64,
    pub amount_sompi: u64,
    pub script_hash: String,
    pub script_hex: String,
    pub covenant_type: String,
    pub category: String,
    pub creator_addr: String,
    pub description: String,
    pub verified_tier: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_payment_tx: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_at: Option<i64>,
    pub custom_ui_enabled: bool,
    pub full_logic_summary: String,
    pub receiving_addresses: String,
    pub is_active: bool,
    pub block_daa_score: u64,
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disclosure_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TierInfo {
    pub name: String,
    pub label: String,
    pub price_kas: u64,
    pub price_sompi: u64,
    pub features: Vec<String>,
    pub color: String,
    pub featured: bool,
}

pub fn get_tiers() -> Vec<TierInfo> {
    vec![
        TierInfo {
            name: "EXPLORER".into(),
            label: "Explorer".into(),
            price_kas: 0,
            price_sompi: 0,
            features: vec![
                "Browse all indexed covenants".into(),
                "Basic interactive UI (all covenants)".into(),
                "Public read-only contract view".into(),
                "Limited disclosure: tx_id, script_hash, amount".into(),
            ],
            color: "gray".into(),
            featured: false,
        },
        TierInfo {
            name: "BUILDER".into(),
            label: "Builder".into(),
            price_kas: 100,
            price_sompi: 1_000_000_000,
            features: vec![
                "Everything in Explorer".into(),
                "Full disclosure: all fields, logic summary".into(),
                "Automatic interactive UI generation".into(),
                "Form builder + wallet-integrated buttons".into(),
                "Standard registry listing".into(),
                "Verified badge on covenant detail page".into(),
            ],
            color: "blue".into(),
            featured: false,
        },
        TierInfo {
            name: "PRO".into(),
            label: "PRO".into(),
            price_kas: 500,
            price_sompi: 5_000_000_000,
            features: vec![
                "Everything in Builder".into(),
                "Featured listing placement".into(),
                "Higher search ranking".into(),
                "Priority indexing queue".into(),
                "Custom UI advanced tools".into(),
                "Custom covenant images".into(),
            ],
            color: "gold".into(),
            featured: true,
        },
        TierInfo {
            name: "MAX".into(),
            label: "MAX".into(),
            price_kas: 1000,
            price_sompi: 10_000_000_000,
            features: vec![
                "Everything in PRO".into(),
                "Maximum visibility - top placement".into(),
                "Custom domain embedding".into(),
                "Dedicated indexing resources".into(),
                "Premium branding options".into(),
                "Full UI design suite".into(),
                "Custom color palette UI".into(),
            ],
            color: "purple".into(),
            featured: false,
        },
    ]
}

pub fn tier_from_amount(sompi: u64) -> Option<&'static str> {
    let kas = sompi as f64 / 100_000_000.0;
    if kas >= 1000.0 {
        Some("MAX")
    } else if kas >= 500.0 {
        Some("PRO")
    } else if kas >= 100.0 {
        Some("BUILDER")
    } else {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiGenerationConfig {
    pub covenant_id: String,
    pub covenant_name: String,
    pub category: String,
    pub script_hash: String,
    pub parameters: Vec<UiParameter>,
    #[serde(default)]
    pub is_enhanced: bool,
    #[serde(default)]
    pub disclosure_level: String,
    #[serde(default)]
    pub creator_addr: String,
    /// Honest on-chain enforcement label (covenant_catalog::reality_for_script):
    /// "on-chain" | "hybrid" | "oracle-attested" | "decorative" (empty = unknown).
    /// Drives the basic-UI trust banner: a consensus-enforced (on-chain) covenant is
    /// the STRONGEST guarantee and must NOT be labeled "dangerous/unverified".
    #[serde(default)]
    pub enforcement_reality: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiParameter {
    pub name: String,
    pub label: String,
    pub param_type: String,
    pub required: bool,
    pub placeholder: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
}
