use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CovenantCategory {
    #[serde(rename = "skill")]
    Skill,
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
    #[serde(rename = "general")]
    General,
}

impl CovenantCategory {
    pub fn from_script_ops(script_hex: &str) -> Self {
        if script_hex.contains("aa20") || script_hex.contains("aa21") {
            if script_hex.contains("51") {
                return CovenantCategory::General;
            }
            return CovenantCategory::Skill;
        }
        if script_hex.is_empty() {
            return CovenantCategory::General;
        }
        CovenantCategory::General
    }

    pub fn label(&self) -> &'static str {
        match self {
            CovenantCategory::Skill => "Skill Contests",
            CovenantCategory::Predictive => "Predictive Markets",
            CovenantCategory::Escrow => "Escrow & Custody",
            CovenantCategory::Tournament => "Tournaments",
            CovenantCategory::CommunityPool => "Community Pools",
            CovenantCategory::Flash => "Flash Covenants",
            CovenantCategory::Structured => "Structured Settlement",
            CovenantCategory::Governance => "Governance",
            CovenantCategory::General => "General",
        }
    }
}

/// Disclosure level for covenant transparency
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DisclosureLevel {
    #[serde(rename = "limited")]
    Limited,   // FREE/EXPLORER: basic fields only + danger banner
    #[serde(rename = "full")]
    Full,      // CREATOR+: full transparency, all fields, verified badge
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
            name: "EXPLORER".into(), label: "Explorer".into(), price_kas: 0, price_sompi: 0,
            features: vec![
                "Browse all indexed covenants".into(),
                "Basic interactive UI (all covenants)".into(),
                "Public read-only contract view".into(),
                "Limited disclosure: tx_id, script_hash, amount".into(),
            ],
            color: "gray".into(), featured: false,
        },
        TierInfo {
            name: "CREATOR".into(), label: "Creator".into(), price_kas: 100, price_sompi: 10_000_000_00,
            features: vec![
                "Everything in Explorer".into(),
                "Full disclosure: all fields, logic summary".into(),
                "Automatic interactive UI generation".into(),
                "Form builder + wallet-integrated buttons".into(),
                "Standard registry listing".into(),
                "Verified badge on covenant detail page".into(),
            ],
            color: "blue".into(), featured: false,
        },
        TierInfo {
            name: "PRO".into(), label: "PRO".into(), price_kas: 500, price_sompi: 50_000_000_00,
            features: vec![
                "Everything in Creator".into(),
                "Featured listing placement".into(),
                "Higher search ranking".into(),
                "Priority indexing queue".into(),
                "Custom UI advanced tools".into(),
                "Custom covenant images".into(),
            ],
            color: "gold".into(), featured: true,
        },
        TierInfo {
            name: "MAX".into(), label: "MAX".into(), price_kas: 1000, price_sompi: 100_000_000_00,
            features: vec![
                "Everything in PRO".into(),
                "Maximum visibility - top placement".into(),
                "Custom domain embedding".into(),
                "Dedicated indexing resources".into(),
                "Premium branding options".into(),
                "Full UI design suite".into(),
                "Custom color palette UI".into(),
            ],
            color: "purple".into(), featured: false,
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
        Some("CREATOR")
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
