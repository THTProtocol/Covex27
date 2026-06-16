// ── Covex27 Dev Wallet Registry ──────────────────────────────────────────
//
// Public addresses + the TESTNET dev-deployer private keys that the dev-mode
// covenant deploy/spend flows sign with directly (signer.rs, covenant_builder.rs,
// and the main.rs dev-seed). These are low-value testnet (TN10/TN12) keys.
//
// SECURITY NOTES:
//   * Mainnet keys are NEVER in source — all mainnet signing goes through wallet
//     extensions / env vars. Only the env-var treasury/oracle config is used by
//     the running service for anything that holds real value.
//   * The unused wallet mnemonics and the treasury private keys that used to live
//     here were dead code (the compiler reported them "never used") and have been
//     removed so no spendable treasury key material sits in source. Any key that
//     was ever committed here must be treated as COMPROMISED — rotate it (and move
//     any funds) rather than relying on its removal, since it remains in git
//     history. Never reuse any of these testnet keys on mainnet.
//
// Wallet 1 & 2 are testnet dev deployers. Wallet 3 is the treasury (address only;
// the treasury receives tier fees but never signs from source). Every paid-tier
// covenant deployment MUST include Output 1 sending the correct tier fee to the
// treasury address from one of these deployer wallets — verified by the crawler's
// output-position check.
//
// NEVER change these addresses without coordinated redeployment of all covenant
// contracts.

/// ─── TN12 (testnet-12) wallets ────────────────────────────────────────

/// Wallet 1 — Primary Dev Deployer (TN12)
pub const DEV_WALLET_1_ADDRESS_TN12: &str =
    "kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353";
pub const DEV_WALLET_1_PRIVATE_KEY_TN12: &str =
    "549cd5a5426360da67b66edd561d37b348a026708d01b519d396b868cda267c9";

/// Wallet 2 — Secondary Dev Deployer (TN12)
pub const DEV_WALLET_2_ADDRESS_TN12: &str =
    "kaspatest:qpw2yxrmfudv56lvav32s8jz6uwqhp2x0x7fna0640qx3gwp70d55uue9uecs";
pub const DEV_WALLET_2_PRIVATE_KEY_TN12: &str =
    "a6b2f789075ff7115a3b6224e7da0d676be999cb121640220784e30206f07f60";

/// Wallet 3 — Treasury (TN12) — address only; the treasury private key is not
/// stored in source (it was dead code and was removed).
pub const TREASURY_ADDRESS_TN12: &str =
    "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m";

/// ─── TN10 (testnet-10) wallets ────────────────────────────────────────
/// TN10 uses the same treasury as TN12 — the private key derives the same address
/// on both testnet chains. Backend indexers tag rows with network=testnet-10,
/// so data stays fully isolated even though the treasury address is identical.

/// Wallet 1 — Primary Dev Deployer (TN10)
pub const DEV_WALLET_1_ADDRESS_TN10: &str =
    "kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353";
pub const DEV_WALLET_1_PRIVATE_KEY_TN10: &str =
    "549cd5a5426360da67b66edd561d37b348a026708d01b519d396b868cda267c9";

/// Wallet 2 — Secondary Dev Deployer (TN10)
pub const DEV_WALLET_2_ADDRESS_TN10: &str =
    "kaspatest:qpw2yxrmfudv56lvav32s8jz6uwqhp2x0x7fna0640qx3gwp70d55uue9uecs";
pub const DEV_WALLET_2_PRIVATE_KEY_TN10: &str =
    "a6b2f789075ff7115a3b6224e7da0d676be999cb121640220784e30206f07f60";

/// Wallet 3 — Treasury (TN10)
/// Same address as TN12: kaspatest:qpyfz03... — valid on both testnet-10 and testnet-12.
pub const TREASURY_ADDRESS_TN10: &str = TREASURY_ADDRESS_TN12;

/// ─── Mainnet wallets ───────────────────────────────────────────────────
/// Mainnet treasury address is the only hardcoded value (public, where KAS is sent).
/// Private keys are NEVER in source — all mainnet signing goes through wallet extensions.
/// Seed addresses are empty: mainnet covenants are discovered via the crawler, not UTXO polling.

pub const TREASURY_ADDRESS_MAINNET: &str =
    "kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2";

/// ─── Backward-compatible aliases (TN12, kept for existing code) ──────

pub const DEV_WALLET_1_ADDRESS: &str = DEV_WALLET_1_ADDRESS_TN12;
pub const DEV_WALLET_1_PRIVATE_KEY: &str = DEV_WALLET_1_PRIVATE_KEY_TN12;

pub const DEV_WALLET_2_ADDRESS: &str = DEV_WALLET_2_ADDRESS_TN12;
pub const DEV_WALLET_2_PRIVATE_KEY: &str = DEV_WALLET_2_PRIVATE_KEY_TN12;

pub const TREASURY_ADDRESS: &str = TREASURY_ADDRESS_TN12;

/// ─── Network-aware helpers ───────────────────────────────────────────

/// Return the treasury address for the given network
pub fn treasury_address_for_network(network: &str) -> &'static str {
    if network == "testnet-10" {
        TREASURY_ADDRESS_TN10
    } else if network == "mainnet" || network == "mainnet-1" {
        TREASURY_ADDRESS_MAINNET
    } else {
        TREASURY_ADDRESS_TN12
    }
}
