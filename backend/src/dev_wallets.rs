// ── Covex27 Dev Wallet Registry ──────────────────────────────────────────
//
// HARDCODED ON-CHAIN TRUTH. Three wallets per network constitute the development
// ecosystem for Covex27 covenant deployment and tier verification.
//
// Wallet 1 & 2 are deployer wallets. Wallet 3 is the treasury.
// Every paid-tier covenant deployment MUST include Output 1 sending
// the correct tier fee to the treasury address from one of these
// deployer wallets — verified by the crawler's output-position check.
//
// NEVER change these addresses without coordinated redeployment
// of all covenant contracts.

/// ─── TN12 (testnet-12) wallets ────────────────────────────────────────

/// Wallet 1 — Primary Dev Deployer (TN12)
pub const DEV_WALLET_1_ADDRESS_TN12: &str =
    "kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353";
pub const DEV_WALLET_1_MNEMONIC_TN12: &str =
    "fitness narrow gap scheme fold regret faint neck blanket discover feel machine";
pub const DEV_WALLET_1_PRIVATE_KEY_TN12: &str =
    "549cd5a5426360da67b66edd561d37b348a026708d01b519d396b868cda267c9";

/// Wallet 2 — Secondary Dev Deployer (TN12)
pub const DEV_WALLET_2_ADDRESS_TN12: &str =
    "kaspatest:qpw2yxrmfudv56lvav32s8jz6uwqhp2x0x7fna0640qx3gwp70d55uue9uecs";
pub const DEV_WALLET_2_MNEMONIC_TN12: &str =
    "giggle alpha happy until wing zone cat argue april walnut uncover rate";
pub const DEV_WALLET_2_PRIVATE_KEY_TN12: &str =
    "a6b2f789075ff7115a3b6224e7da0d676be999cb121640220784e30206f07f60";

/// Wallet 3 — Treasury (TN12)
pub const TREASURY_ADDRESS_TN12: &str =
    "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m";
pub const TREASURY_MNEMONIC_TN12: &str =
    "upon machine office cup raw vehicle will jelly goddess mother lesson disagree";
pub const TREASURY_PRIVATE_KEY_TN12: &str =
    "0be4e04a2e0afdbe6caf73707ee9cbe8b11a986fea3bbd46dca98d5445b8a1d3";

/// ─── TN10 (testnet-10) wallets ────────────────────────────────────────
/// PLACEHOLDERS — REPLACE WITH ACTUAL TN10 VALUES PROVIDED BY OPERATOR
/// These will be used when kaspaNetwork = 'testnet-10' is selected.

/// Wallet 1 — Primary Dev Deployer (TN10)
pub const DEV_WALLET_1_ADDRESS_TN10: &str =
    "kaspatest:REPLACE_WITH_TN10_DEV_WALLET_1_ADDRESS";
pub const DEV_WALLET_1_MNEMONIC_TN10: &str =
    "REPLACE WITH TN10 DEV WALLET 1 MNEMONIC";
pub const DEV_WALLET_1_PRIVATE_KEY_TN10: &str =
    "REPLACE_WITH_TN10_DEV_WALLET_1_PRIVATE_KEY_HEX";

/// Wallet 2 — Secondary Dev Deployer (TN10)
pub const DEV_WALLET_2_ADDRESS_TN10: &str =
    "kaspatest:REPLACE_WITH_TN10_DEV_WALLET_2_ADDRESS";
pub const DEV_WALLET_2_MNEMONIC_TN10: &str =
    "REPLACE WITH TN10 DEV WALLET 2 MNEMONIC";
pub const DEV_WALLET_2_PRIVATE_KEY_TN10: &str =
    "REPLACE_WITH_TN10_DEV_WALLET_2_PRIVATE_KEY_HEX";

/// Wallet 3 — Treasury (TN10)
pub const TREASURY_ADDRESS_TN10: &str =
    "kaspatest:REPLACE_WITH_TN10_TREASURY_ADDRESS";
pub const TREASURY_MNEMONIC_TN10: &str =
    "REPLACE WITH TN10 TREASURY MNEMONIC";
pub const TREASURY_PRIVATE_KEY_TN10: &str =
    "REPLACE_WITH_TN10_TREASURY_PRIVATE_KEY_HEX";

/// ─── Backward-compatible aliases (TN12, kept for existing code) ──────

pub const DEV_WALLET_1_ADDRESS: &str = DEV_WALLET_1_ADDRESS_TN12;
pub const DEV_WALLET_1_MNEMONIC: &str = DEV_WALLET_1_MNEMONIC_TN12;
pub const DEV_WALLET_1_PRIVATE_KEY: &str = DEV_WALLET_1_PRIVATE_KEY_TN12;

pub const DEV_WALLET_2_ADDRESS: &str = DEV_WALLET_2_ADDRESS_TN12;
pub const DEV_WALLET_2_MNEMONIC: &str = DEV_WALLET_2_MNEMONIC_TN12;
pub const DEV_WALLET_2_PRIVATE_KEY: &str = DEV_WALLET_2_PRIVATE_KEY_TN12;

pub const TREASURY_ADDRESS: &str = TREASURY_ADDRESS_TN12;
pub const TREASURY_MNEMONIC: &str = TREASURY_MNEMONIC_TN12;
pub const TREASURY_PRIVATE_KEY: &str = TREASURY_PRIVATE_KEY_TN12;

/// ─── Network-aware helpers ───────────────────────────────────────────

/// Return the treasury address for the given network
pub fn treasury_address_for_network(network: &str) -> &'static str {
    if network == "testnet-10" {
        TREASURY_ADDRESS_TN10
    } else {
        TREASURY_ADDRESS_TN12
    }
}

/// Return the deployer wallet addresses for the given network
pub fn dev_wallet_addresses_for_network(network: &str) -> Vec<&'static str> {
    if network == "testnet-10" {
        vec![DEV_WALLET_1_ADDRESS_TN10, DEV_WALLET_2_ADDRESS_TN10]
    } else {
        vec![DEV_WALLET_1_ADDRESS_TN12, DEV_WALLET_2_ADDRESS_TN12]
    }
}

/// Return all dev addresses (deployers + treasury) for the given network
pub fn all_dev_addresses_for_network(network: &str) -> Vec<&'static str> {
    if network == "testnet-10" {
        vec![DEV_WALLET_1_ADDRESS_TN10, DEV_WALLET_2_ADDRESS_TN10, TREASURY_ADDRESS_TN10]
    } else {
        vec![DEV_WALLET_1_ADDRESS_TN12, DEV_WALLET_2_ADDRESS_TN12, TREASURY_ADDRESS_TN12]
    }
}

/// Return wallet identities (label, address, private_key) for the given network
pub fn wallet_identities_for_network(
    network: &str,
) -> Vec<(&'static str, &'static str, &'static str)> {
    if network == "mainnet" || network == "mainnet-1" {
        // NEVER use hardcoded for mainnet. These are explicit dummies.
        vec![
            ("Dev Wallet 1 (MAINNET - ENV REQUIRED)", "kaspa:MAINNET_DEV1_MUST_BE_SET_IN_ENV", "MAINNET_PRIVATE_HEX_MUST_BE_SET_IN_ENV"),
            ("Dev Wallet 2 (MAINNET - ENV REQUIRED)", "kaspa:MAINNET_DEV2_MUST_BE_SET_IN_ENV", "MAINNET_PRIVATE_HEX_MUST_BE_SET_IN_ENV"),
            ("Treasury (MAINNET - ENV REQUIRED)", std::env::var("COVENANT_TREASURY_ADDRESS").unwrap_or("kaspa:MAINNET_TREASURY_MUST_BE_SET_IN_ENV".to_string()).leak(), "MAINNET_TREASURY_HEX_MUST_BE_SET_IN_ENV"),
        ]
    } else if network == "testnet-10" {
        vec![
            ("Dev Wallet 1 (TN10)", DEV_WALLET_1_ADDRESS_TN10, DEV_WALLET_1_PRIVATE_KEY_TN10),
            ("Dev Wallet 2 (TN10)", DEV_WALLET_2_ADDRESS_TN10, DEV_WALLET_2_PRIVATE_KEY_TN10),
            ("Treasury (TN10)", TREASURY_ADDRESS_TN10, TREASURY_PRIVATE_KEY_TN10),
        ]
    } else {
        vec![
            ("Dev Wallet 1 (TN12)", DEV_WALLET_1_ADDRESS_TN12, DEV_WALLET_1_PRIVATE_KEY_TN12),
            ("Dev Wallet 2 (TN12)", DEV_WALLET_2_ADDRESS_TN12, DEV_WALLET_2_PRIVATE_KEY_TN12),
            ("Treasury (TN12)", TREASURY_ADDRESS_TN12, TREASURY_PRIVATE_KEY_TN12),
        ]
    }
}

/// Returns true if the address is one of the dev deployer wallets for the given network
pub fn is_dev_deployer_for_network(addr: &str, network: &str) -> bool {
    let devs = dev_wallet_addresses_for_network(network);
    devs.iter().any(|&d| d == addr)
}

/// Returns true if the address is one of the dev deployer wallets (TN12 only, backward compat)
pub fn is_dev_deployer(addr: &str) -> bool {
    is_dev_deployer_for_network(addr, "testnet-12")
}

/// All three TN12 wallet addresses for seed indexing (backward compat)
pub fn all_dev_addresses() -> Vec<&'static str> {
    all_dev_addresses_for_network("testnet-12")
}

/// All three TN12 wallet identities (backward compat)
pub fn all_wallet_identities() -> Vec<(&'static str, &'static str, &'static str)> {
    wallet_identities_for_network("testnet-12")
}
