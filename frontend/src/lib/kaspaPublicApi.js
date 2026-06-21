// Read-only access used by the recovery page to confirm a covenant's locked balance/UTXOs.
// Networks with a real CORS-enabled kaspa-rest-server (mainnet, testnet-10) are read from the
// PUBLIC node, so mainnet (real-funds) recovery is verifiable INDEPENDENTLY of Covex.
// The custom Toccata testnet-12 has no public REST API (tn12.kaspa.stream is the explorer SPA,
// not an API), so for that network only we fall back to Covex's own backend node. That is less
// "independent" than a public node, but it is the only way to confirm a balance on tn12, and it
// is testnet (test funds). Read-only either way: we never broadcast from here.
const PUBLIC_API = {
  mainnet: 'https://api.kaspa.org',
  'mainnet-1': 'https://api.kaspa.org',
  'testnet-10': 'https://api-tn10.kaspa.org',
};

// Networks served by Covex's own backend node when no public REST exists.
const BACKEND_FALLBACK = new Set(['testnet-12']);

export function hasPublicApi(network) {
  return !!PUBLIC_API[network] || BACKEND_FALLBACK.has(network);
}

// Known wRPC (Borsh) node URLs the in-browser redeemer can try BEFORE falling back to
// the kaspa-wasm public Resolver. This is the "Covex is down" broadcast path: the spend
// is assembled + signed locally and submitted directly to a node, with no Covex
// infrastructure. Mirrors the standalone cold-recovery tool's PUBLIC_NODES list verbatim
// so both paths use the same honest set.
//
// HONESTY: the public Resolver has NO Toccata testnet-12 nodes, and there is no public
// CORS/wRPC testnet-12 endpoint a browser can open (the live tn12 node is server-local).
// So tn12 has no entry here and the Resolver cannot reach it either - the broadcast()
// caller surfaces that clearly and the always-available Sign-and-export path is the
// answer for tn12. We do NOT invent a tn12 node URL we cannot stand behind.
const WRPC_NODES = Object.freeze({
  mainnet: Object.freeze(['wss://api.kaspa.org/borsh', 'wss://kas.fyi/borsh']),
  'mainnet-1': Object.freeze(['wss://api.kaspa.org/borsh', 'wss://kas.fyi/borsh']),
  'testnet-10': Object.freeze([]),
  'testnet-12': Object.freeze([]),
});

// Returns the ordered list of known wRPC node URLs to try for a network (may be empty,
// in which case the caller falls back to the kaspa-wasm Resolver).
export function wrpcNodesFor(network) {
  return WRPC_NODES[network] || [];
}

function parseBalance(j) {
  const bal = typeof j.balance === 'number' ? j.balance : Number(j.balance);
  if (!Number.isFinite(bal)) throw new Error('Unexpected balance response.');
  return bal;
}

// Returns the address balance in SOMPI (1 KAS = 1e8 sompi), or throws on transport/HTTP error.
export async function fetchAddressBalanceSompi(address, network, signal) {
  if (!address) throw new Error('No address.');
  const base = PUBLIC_API[network];
  if (base) {
    const res = await fetch(`${base}/addresses/${encodeURIComponent(address)}/balance`, { signal });
    if (!res.ok) throw new Error(`Public node returned HTTP ${res.status}`);
    return parseBalance(await res.json());
  }
  if (BACKEND_FALLBACK.has(network)) {
    const res = await fetch(`/api/balance/${encodeURIComponent(address)}?network=${encodeURIComponent(network)}`, { signal });
    if (!res.ok) throw new Error(`Covex node returned HTTP ${res.status}`);
    return parseBalance(await res.json());
  }
  throw new Error('No public node for this network.');
}

export const sompiToKas = (sompi) => (Number(sompi) || 0) / 1e8;

// Returns the address's UTXOs (the exact coins a redeem would spend), normalized to
// [{ txid, index, amountSompi, daaScore }]. Read-only. Covenant P2SH addresses hold only a few.
export async function fetchAddressUtxos(address, network, signal) {
  if (!address) throw new Error('No address.');
  const base = PUBLIC_API[network];
  if (base) {
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
  if (BACKEND_FALLBACK.has(network)) {
    // Covex backend shape: { utxos: [{ amount, index, tx_id, script_hex }] }
    const res = await fetch(`/api/utxos/${encodeURIComponent(address)}?network=${encodeURIComponent(network)}`, { signal });
    if (!res.ok) throw new Error(`Covex node returned HTTP ${res.status}`);
    const j = await res.json();
    const arr = Array.isArray(j?.utxos) ? j.utxos : (Array.isArray(j) ? j : []);
    return arr.map((u) => ({
      txid: u?.tx_id || u?.txid || '',
      index: u?.index ?? 0,
      amountSompi: Number(u?.amount) || 0,
      daaScore: Number(u?.daaScore ?? u?.blockDaaScore) || null,
    }));
  }
  throw new Error('No public node for this network.');
}
