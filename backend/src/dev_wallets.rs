// ── Covex27 Dev Wallet Registry (SANITIZED AFTER LEAK) ───────────────────────────────────
//
// CRITICAL SECURITY INCIDENT RESPONSE (REMEDIATION)
//
// This file PREVIOUSLY contained the following secrets in plaintext:
//   - Three full 12-word BIP39 mnemonics
//   - Three corresponding hex private keys
//
// These values were publicly committed to the GitHub repository and are
// now considered 100% compromised on Kaspa testnet.
//
// IMMEDIATE ACTIONS FOR MAINTAINERS:
// 1. The three wallets (Dev Wallet 1, Dev Wallet 2, Treasury) must be
//    abandoned. Any funds on them are at risk.
// 2. Generate brand new wallets for any future development or treasury use.
// 3. Update any on-chain references, indexing configurations, and deployment
//    processes to use the new addresses only.
// 4. Perform a full git history rewrite (git-filter-repo) to purge the old
//    secrets from the repository history before any public re-push.
// 5. Rotate the Hetzner server password that was also hardcoded in deploy scripts.
//
// NEVER put mnemonics, seeds, or private keys in source code again.
// Use environment variables + a secrets manager (or local encrypted config)
// for any development-only keys.

/// Historical addresses (public on-chain via previous transactions).
/// These specific wallets are compromised and should no longer be used.
/// Listed here only for historical reference and to aid in migration.
pub const DEV_WALLET_1_ADDRESS: &str =
    "kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353"; // COMPROMISED - DO NOT USE

pub const DEV_WALLET_2_ADDRESS: &str =
    "kaspatest:qpw2yxrmfudv56lvav32s8jz6uwqhp2x0x7fna0640qx3gwp70d55uue9uecs"; // COMPROMISED - DO NOT USE

pub const TREASURY_ADDRESS: &str =
    "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m"; // COMPROMISED - DO NOT USE

/// Returns true if the address matches one of the historical (now compromised) dev deployer addresses.
pub fn is_dev_deployer(addr: &str) -> bool {
    addr == DEV_WALLET_1_ADDRESS || addr == DEV_WALLET_2_ADDRESS
}

/// Returns the list of historical dev/treasury addresses (for migration/indexing cleanup only).
pub fn all_dev_addresses() -> Vec<&'static str> {
    vec![DEV_WALLET_1_ADDRESS, DEV_WALLET_2_ADDRESS, TREASURY_ADDRESS]
}

// NOTE: The previous all_wallet_identities() function that returned private keys
// has been permanently removed. No private key material exists in this file.