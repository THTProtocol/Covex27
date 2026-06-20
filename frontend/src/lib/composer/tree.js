// composer/tree.js
//
// The data model for the COMPOSABLE covenant builder: a closed alphabet of atomic
// condition leaves + two combinators (ALL-of / AND, EITHER / OR), serialized as a
// recursive tagged union. This module is pure data + helpers - no crypto, no network.
// The byte-emitting redeem/satisfier (the golden-gated part) lives in a later slice;
// this is the grammar + identity the validator and UI run on.
//
// Safety thesis: every leaf is a thin wrapper over a redeem-fragment + satisfier-arm that
// ALREADY exists and is proven on-chain in the backend. A composition is deployable only
// if it passes validateAlwaysSpendable (validate.js), whose core gate is a mandatory
// deployer-controlled on-chain refund branch so funds can never strand.

// The ONLY legal leaves. tier is carried as data so the UI can never overclaim enforcement.
// gatesFunds = true means adding this leaf makes a mandatory on-chain backstop REQUIRED
// (it depends on a secret, a counterparty, or the oracle, so the funds could otherwise be
// stranded if that dependency never resolves).
export const LEAF_KINDS = {
  singlesig: { label: 'Signature',          tier: 'on_chain',     gatesFunds: false, params: ['pubkey'] },
  hashlock:  { label: 'Secret (hashlock)',  tier: 'on_chain',     gatesFunds: true,  params: ['hash32', 'pubkey'] },
  timelock:  { label: 'After a date',       tier: 'on_chain',     gatesFunds: false, params: ['lock_daa', 'pubkey'] },
  rcsv:      { label: 'After a delay',      tier: 'on_chain',     gatesFunds: false, params: ['min_sequence', 'pubkey'] },
  multisig:  { label: 'M-of-N signatures',  tier: 'on_chain',     gatesFunds: false, params: ['pubkeys', 'required'] },
  oracle:    { label: 'Oracle decision',    tier: 'oracle_gated', gatesFunds: true,  params: ['oracle', 'winner'] },
};

export const MAX_DEPTH = 6;
// Cap a time backstop at ~1 year of DAA so a deployer can always eventually reclaim.
export const MAX_BACKSTOP_HORIZON_DAA = 31_536_000;

// Node constructors. `signer` on a leaf names who satisfies it ('deployer' | 'claimant' |
// 'counterparty' | 'oracle'); it defaults to the connected wallet when omitted. role marks
// a leaf/branch as the mandatory refund 'backstop'.
export const leaf = (kind, params = {}, role = 'primary') => ({ node: 'leaf', kind, role, params });
export const allOf = (...children) => ({ node: 'and', children });
export const either = (...children) => ({ node: 'or', children });

// Canonical serialization (stable key order, no whitespace): the composite's identity.
// The deploy + spend paths recompute this and abort on mismatch (binds funding to logic).
export function canonical(node) {
  if (!node || typeof node !== 'object') return 'null';
  if (node.node === 'leaf') {
    const p = node.params || {};
    const ps = Object.keys(p).sort().map((k) => `${JSON.stringify(k)}:${JSON.stringify(p[k])}`).join(',');
    return `{"node":"leaf","kind":${JSON.stringify(node.kind)},"role":${JSON.stringify(node.role || 'primary')},"params":{${ps}}}`;
  }
  const ch = (node.children || []).map(canonical).join(',');
  return `{"node":${JSON.stringify(node.node)},"children":[${ch}]}`;
}

// Collect every leaf in the tree (DFS, script order).
export function leaves(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.node === 'leaf') { out.push(node); return out; }
  (node.children || []).forEach((c) => leaves(c, out));
  return out;
}

export function depth(node) {
  if (!node || node.node === 'leaf') return 1;
  const kids = (node.children || []).map(depth);
  return 1 + (kids.length ? Math.max(...kids) : 0);
}

// The honest enforcement tier of the whole composition = the LEAST-trustless leaf.
export function compositionTier(root) {
  return leaves(root).some((lf) => LEAF_KINDS[lf.kind]?.tier === 'oracle_gated') ? 'oracle_gated' : 'on_chain';
}
