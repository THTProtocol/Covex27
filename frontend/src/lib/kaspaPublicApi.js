// Read-only access to PUBLIC Kaspa REST nodes, used by the recovery page to confirm a covenant's
// locked balance independently of Covex. These are the community/official kaspa-rest-server
// endpoints (CORS-enabled, callable from the browser). Read-only: we never broadcast from here.

// Only networks with a real, CORS-enabled kaspa-rest-server. testnet-12 has no public REST API
// today (tn12.kaspa.stream is the explorer SPA, not an API), so the recovery page falls back to the
// explorer link there instead of showing a balance. Mainnet - the real-funds recovery case - works.
const PUBLIC_API = {
  mainnet: 'https://api.kaspa.org',
  'mainnet-1': 'https://api.kaspa.org',
  'testnet-10': 'https://api-tn10.kaspa.org',
};

export function hasPublicApi(network) {
  return !!PUBLIC_API[network];
}

// Returns the address balance in SOMPI (1 KAS = 1e8 sompi), or throws on transport/HTTP error.
export async function fetchAddressBalanceSompi(address, network, signal) {
  const base = PUBLIC_API[network];
  if (!base || !address) throw new Error('No public node for this network.');
  const res = await fetch(`${base}/addresses/${encodeURIComponent(address)}/balance`, { signal });
  if (!res.ok) throw new Error(`Public node returned HTTP ${res.status}`);
  const j = await res.json();
  const bal = typeof j.balance === 'number' ? j.balance : Number(j.balance);
  if (!Number.isFinite(bal)) throw new Error('Unexpected balance response.');
  return bal;
}

export const sompiToKas = (sompi) => (Number(sompi) || 0) / 1e8;
