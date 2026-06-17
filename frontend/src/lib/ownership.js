// Covenant ownership proof for Studio/FIX edits.
//
// The backend requires a wallet signature over a server-issued challenge before
// it will save a terminal-config for an indexed covenant (creator addresses are
// public, so a signature is the only real proof of control). This helper fetches
// the challenge, signs the exact message, and returns the fields the backend
// verifies: { signer_address, signature, nonce }.
//
// signMessage comes from useWallet(); it handles both extension wallets (real
// Kaspa schnorr) and the dev wallet (schnorr via kaspa-wasm). Throws on failure
// so callers can surface a clear "signature required" message instead of a
// silent rejection.
export async function signCovenantOwnership(covenantId, address, signMessage) {
  if (!address) throw new Error('Connect the creator wallet first.');
  if (typeof signMessage !== 'function') throw new Error('This wallet cannot sign messages.');

  const r = await fetch(`/api/terminal-config-challenge/${encodeURIComponent(covenantId)}`);
  if (!r.ok) throw new Error('Could not get an ownership challenge from the server.');
  const d = await r.json();
  const nonce = d.nonce || '';
  const message = d.message || `covex-config:${covenantId}:${nonce}`;

  const signature = await signMessage(message);
  if (!signature) throw new Error('Wallet did not return a signature.');

  return { signer_address: address, signature, nonce };
}

// Market-resolution proof. The backend (C2) only lets the recorded market creator
// reveal a winning outcome, and requires a wallet signature over
// `covex-market-resolve:{market_id}:{outcome}:{nonce}` by that creator address.
// The nonce is caller-chosen (the reveal carries it in the signed message for
// freshness), so we generate one client-side. Returns the fields the backend
// verifies: { signer_address, signature, nonce }.
export async function signMarketResolve(marketId, outcome, address, signMessage) {
  if (!address) throw new Error('Connect the market creator wallet first.');
  if (typeof signMessage !== 'function') throw new Error('This wallet cannot sign messages.');

  const nonce =
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const message = `covex-market-resolve:${marketId}:${outcome}:${nonce}`;

  const signature = await signMessage(message);
  if (!signature) throw new Error('Wallet did not return a signature.');

  return { signer_address: address, signature, nonce };
}
