// ── Covex27 Dev Wallet Registry ──────────────────────────────────────────
//
// Public addresses ONLY. The TESTNET dev-deployer PRIVATE keys that the dev-mode
// covenant deploy/spend flows sign with (signer.rs, covenant_builder.rs, and the
// main.rs dev-seed) are NO LONGER stored in source - they live exclusively in the
// service environment and are read via `dev_private_key()` below. These are
// low-value testnet (TN10/TN12) keys.
//
// SECURITY NOTES:
//   * NO private key material lives in this file. Mainnet signing goes through
//     wallet extensions; testnet dev-deployer signing reads keys from env vars.
//     Only the env-var treasury/oracle config is used by the running service for
//     anything that holds real value.
//   * The dev-deployer keys were migrated out of source into env vars and ROTATED
//     (fresh keypairs, old testnet funds swept) on 2026-06-16. The previous keys
//     (and the older mnemonics/treasury keys) had been committed here, so they are
//     COMPROMISED for all time - they remain in git history. Never resurrect them
//     and never reuse any testnet key on mainnet.
//   * The address constants below MUST match the private keys configured in the
//     environment (a key derives exactly one address). If you rotate a dev key you
//     MUST update its address constant here in the same change, or dev-mode signing
//     will produce signatures the node rejects.
//
// Wallet 1 & 2 are testnet dev deployers. Wallet 3 is the treasury (address only;
// the treasury receives tier fees but never signs from source). Every paid-tier
// covenant deployment MUST include Output 1 sending the correct tier fee to the
// treasury address from one of these deployer wallets - verified by the crawler's
// output-position check.
//
// NEVER change these addresses without coordinated redeployment of all covenant
// contracts (and a matching key rotation in the environment).

/// ─── TN12 (testnet-12) wallets ────────────────────────────────────────

/// Wallet 1 - Primary Dev Deployer (TN12). Private key: env COVEX_DEV_WALLET_1_KEY_TN12.
/// Rotated 2026-06-16 (old key qrh603...549cd5 compromised + funds swept).
pub const DEV_WALLET_1_ADDRESS_TN12: &str =
    "kaspatest:qp8q6ya2txnlzsd8c6qkz9q6ew4he2ny797nejyntzkn3gkdelu270f45cmxa";

/// Wallet 2 - Secondary Dev Deployer (TN12). Private key: env COVEX_DEV_WALLET_2_KEY_TN12.
/// Rotated 2026-06-16 (old key qpw2yx...a6b2f7 compromised + funds swept).
pub const DEV_WALLET_2_ADDRESS_TN12: &str =
    "kaspatest:qqtk7zesmvvm8g35e8s6amjwq3mw6j564zxuehffedz6zp450pdv7splqvmmk";

/// Wallet 3 - Treasury (TN12) - address only; the treasury private key is not
/// stored in source (it was dead code and was removed).
pub const TREASURY_ADDRESS_TN12: &str =
    "kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m";

/// ─── TN10 (testnet-10) wallets ────────────────────────────────────────
/// TN10 uses the same treasury as TN12 - the private key derives the same address
/// on both testnet chains. Backend indexers tag rows with network=testnet-10,
/// so data stays fully isolated even though the treasury address is identical.

/// Wallet 1 - Primary Dev Deployer (TN10). Private key: env COVEX_DEV_WALLET_1_KEY_TN10.
/// Same keypair as TN12 (derives the same address on both testnets).
pub const DEV_WALLET_1_ADDRESS_TN10: &str =
    "kaspatest:qp8q6ya2txnlzsd8c6qkz9q6ew4he2ny797nejyntzkn3gkdelu270f45cmxa";

/// Wallet 2 - Secondary Dev Deployer (TN10). Private key: env COVEX_DEV_WALLET_2_KEY_TN10.
/// Same keypair as TN12 (derives the same address on both testnets).
pub const DEV_WALLET_2_ADDRESS_TN10: &str =
    "kaspatest:qqtk7zesmvvm8g35e8s6amjwq3mw6j564zxuehffedz6zp450pdv7splqvmmk";

/// Wallet 3 - Treasury (TN10)
/// Same address as TN12: kaspatest:qpyfz03... - valid on both testnet-10 and testnet-12.
pub const TREASURY_ADDRESS_TN10: &str = TREASURY_ADDRESS_TN12;

/// ─── Mainnet wallets ───────────────────────────────────────────────────
/// Mainnet treasury address is the only hardcoded value (public, where KAS is sent).
/// Private keys are NEVER in source - all mainnet signing goes through wallet extensions.
/// Seed addresses are empty: mainnet covenants are discovered via the crawler, not UTXO polling.

pub const TREASURY_ADDRESS_MAINNET: &str =
    "kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2";

/// ─── Backward-compatible address aliases (TN12, kept for existing code) ──────
/// Address only - the matching private key is read from the environment via
/// `dev_private_key()`, never stored in source.

pub const DEV_WALLET_1_ADDRESS: &str = DEV_WALLET_1_ADDRESS_TN12;
pub const DEV_WALLET_2_ADDRESS: &str = DEV_WALLET_2_ADDRESS_TN12;

pub const TREASURY_ADDRESS: &str = TREASURY_ADDRESS_TN12;

/// ─── Network-aware helpers ───────────────────────────────────────────

/// Return the treasury address for the given network
pub fn treasury_address_for_network(network: &str) -> &'static str {
    if network == "testnet-10" {
        TREASURY_ADDRESS_TN10
    } else if crate::covenant_builder::is_mainnet(network) {
        TREASURY_ADDRESS_MAINNET
    } else {
        TREASURY_ADDRESS_TN12
    }
}

/// Resolve a TESTNET dev-deployer private key (hex, no `0x`) for `wallet` (1 or 2)
/// on `network`, reading it from the service environment.
///
/// Keys are NEVER stored in source. They are configured per wallet per testnet via:
///   - `COVEX_DEV_WALLET_1_KEY_TN12` / `COVEX_DEV_WALLET_1_KEY_TN10`
///   - `COVEX_DEV_WALLET_2_KEY_TN12` / `COVEX_DEV_WALLET_2_KEY_TN10`
/// (mirroring how the treasury/oracle config is env-driven - see the covex-backend
/// systemd drop-ins). The configured key MUST derive the matching `DEV_WALLET_*_ADDRESS_*`
/// constant above.
///
/// Hard-fails (returns `Err`) when:
///   - `network` is mainnet - dev-deployer keys are testnet-only and must never be
///     used to move real KAS; or
///   - the env var is unset/blank - so a dev-mode flow fails LOUDLY instead of
///     silently signing with a phantom or stale key.
pub fn dev_private_key(wallet: u8, network: &str) -> Result<String, String> {
    if crate::covenant_builder::is_mainnet(network) {
        return Err(
            "dev-deployer keys are testnet-only and are never available on mainnet; \
             sign with a real wallet extension"
                .to_string(),
        );
    }
    let var = match (wallet, network) {
        (1, "testnet-10") => "COVEX_DEV_WALLET_1_KEY_TN10",
        (2, "testnet-10") => "COVEX_DEV_WALLET_2_KEY_TN10",
        (1, _) => "COVEX_DEV_WALLET_1_KEY_TN12",
        (2, _) => "COVEX_DEV_WALLET_2_KEY_TN12",
        _ => {
            return Err(format!(
                "unknown dev wallet index {wallet} (expected 1 or 2)"
            ))
        }
    };
    match std::env::var(var) {
        Ok(v) if !v.trim().is_empty() => Ok(v.trim().trim_start_matches("0x").to_string()),
        _ => Err(format!(
            "dev wallet key env var {var} is not set; dev-mode testnet signing is disabled. \
             Set it in the covex-backend service environment (see the systemd drop-ins). \
             These keys are never stored in source."
        )),
    }
}
