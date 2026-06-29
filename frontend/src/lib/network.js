/**
 * Single source of truth for "is this a mainnet network string?".
 *
 * The frontend names mainnet inconsistently ('mainnet', 'mainnet-1', and the backend can return
 * other 'mainnet-*' suffixes). Scattered call sites used exact `=== 'mainnet' || === 'mainnet-1'`
 * comparisons, which silently treat a 'mainnet-2' (or any other mainnet-prefixed) string as a
 * TESTNET - the same fail-open hazard the backend's is_mainnet() helper closes. Route every
 * non-wallet mainnet check through this prefix test so a new mainnet suffix is always caught.
 *
 * Mirrors backend is_mainnet(): network.starts_with("mainnet"). The wallet lane
 * (WalletContext/WalletButton/walletSigner) owns its own mainnet gating and is intentionally
 * NOT routed through here.
 *
 * @param {string|null|undefined} net - a network id ('mainnet', 'mainnet-1', 'testnet-10', ...)
 * @returns {boolean} true for any mainnet-prefixed network
 */
export const isMainnet = (net) => String(net ?? '').startsWith('mainnet');
