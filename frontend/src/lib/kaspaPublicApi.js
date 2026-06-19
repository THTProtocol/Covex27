// Read-only access to the PUBLIC Kaspa REST node, used by the recovery page to confirm a covenant's
// locked balance independently of Covex. This is the official kaspa-rest-server endpoint
// (CORS-enabled, callable from the browser). Read-only: we never broadcast from here.

// Mainnet - the real-funds recovery case - uses the official public REST API.
const PUBLIC_API = {
  mainnet: 'https://api.kaspa.org',
  'mainnet-1': 'https://api.kaspa.org',
};

export function hasPublicApi(network) {
  return !!PUBLIC_API[network || 'mainnet'];
}

// Returns the address balance in SOMPI (1 KAS = 1e8 sompi), or throws on transport/HTTP error.
export async function fetchAddressBalanceSompi(address, network, signal) {
  const base = PUBLIC_API[network || 'mainnet'];
  if (!base || !address) throw new Error('No public node for this network.');
  const res = await fetch(`${base}/addresses/${encodeURIComponent(address)}/balance`, { signal });
  if (!res.ok) throw new Error(`Public node returned HTTP ${res.status}`);
  const j = await res.json();
  const bal = typeof j.balance === 'number' ? j.balance : Number(j.balance);
  if (!Number.isFinite(bal)) throw new Error('Unexpected balance response.');
  return bal;
}

export const sompiToKas = (sompi) => (Number(sompi) || 0) / 1e8;

// Returns the address's UTXOs (the exact coins a redeem would spend), normalized to
// [{ txid, index, amountSompi, daaScore }]. Read-only. Covenant P2SH addresses hold only a few.
export async function fetchAddressUtxos(address, network, signal) {
  const base = PUBLIC_API[network || 'mainnet'];
  if (!base || !address) throw new Error('No public node for this network.');
  const res = await fetch(`${base}/addresses/${encodeURIComponent(address)}/utxos`, { signal });
  if (!res.ok) throw new Error(`Public node returned HTTP ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr)) return [];
  return arr.map((u) => ({
    txid: u?.outpoint?.transactionId || '',
    index: u?.outpoint?.index ?? 0,
    amountSompi: Number(u?.utxoEntry?.amount) || 0,
    daaScore: Number(u?.utxoEntry?.blockDaaScore) || null,
  }));
}
