// ── Covex27 Dev Wallet Registry ──────────────────────────────────────────
//
// HARDCODED ON-CHAIN TRUTH. Three wallets constitute the development
// ecosystem for Covex27 covenant deployment and tier verification.
//
// Wallet 1 & 2 are deployer wallets. Wallet 3 is the treasury.
// Every paid-tier covenant deployment MUST include Output 1 sending
// the correct tier fee to the treasury address from one of these
// deployer wallets — verified by the crawler's output-position check.
//
// NEVER change these addresses without coordinated redeployment
// of all covenant contracts.

/// Wallet 1 — Primary Dev Deployer
pub const DEV_WALLET_1_ADDRESS: &str =
    "kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353";
pub const DEV_WALLET_1_MNEMONIC: &str =
    "fitness narrow gap scheme fold regret faint neck blanket discover feel machine";
pub const DEV_WALLET_1_PRIVATE_KEY: &str =
    "549cd5a5426360da67b66edd561d37b348a026708d01b519d396b868cda267c9";

/// Wallet 2 — Secondary Dev Deployer
pub const DEV_WALLET_2_ADDRESS: &str =
    "kaspatest:qpw2yxrmfudv56lvav32s8jz6uwqhp2x0x7fna0640qx3gwp70d55uue9uecs";
pub const DEV_WALLET_2_MNEMONIC: &str =
    "giggle alpha happy until wing zone cat argue april walnut uncover rate";
pub const DEV_WALLET_2_PRIVATE_KEY: &str =
    "a6b2f789075ff7115a3b6224e7da0d676be999cb121640220784e30206f07f60";

/// Wallet 3 — Treasury (receives all tier payments)
pub const TREASURY_ADDRESS: &str =
    "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m";
pub const TREASURY_MNEMONIC: &str =
    "upon machine office cup raw vehicle will jelly goddess mother lesson disagree";
pub const TREASURY_PRIVATE_KEY: &str =
    "0be4e04a2e0afdbe6caf73707ee9cbe8b11a986fea3bbd46dca98d5445b8a1d3";

/// Returns true if the address is one of the dev deployer wallets
pub fn is_dev_deployer(addr: &str) -> bool {
    addr == DEV_WALLET_1_ADDRESS || addr == DEV_WALLET_2_ADDRESS
}

/// All three wallet addresses for seed indexing
pub fn all_dev_addresses() -> Vec<&'static str> {
    vec![DEV_WALLET_1_ADDRESS, DEV_WALLET_2_ADDRESS, TREASURY_ADDRESS]
}

/// All three wallet identities as tuples (label, address, private_key)
pub fn all_wallet_identities() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        (
            "Dev Wallet 1",
            DEV_WALLET_1_ADDRESS,
            DEV_WALLET_1_PRIVATE_KEY,
        ),
        (
            "Dev Wallet 2",
            DEV_WALLET_2_ADDRESS,
            DEV_WALLET_2_PRIVATE_KEY,
        ),
        ("Treasury", TREASURY_ADDRESS, TREASURY_PRIVATE_KEY),
    ]
}
