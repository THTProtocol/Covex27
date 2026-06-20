// composer/describe.js
//
// Human-readable rendering of a composition + its HONEST enforcement label. Drives the
// builder's live readout so a non-coder sees, in plain English, exactly what their covenant
// does and how trustless each path is. Pure, no crypto - keeps "easy to use" honest.

import { LEAF_KINDS, leaves, compositionTier } from './tree';

const who = (p) => (p?.signer === 'deployer' || p?.role === 'backstop' ? 'you' : (p?.signer === 'counterparty' ? 'the other party' : 'the holder'));

function describeLeaf(node) {
  const p = node.params || {};
  switch (node.kind) {
    case 'singlesig': return `${who(node)} sign`;
    case 'hashlock': return `${who(node)} reveal the secret and sign`;
    case 'timelock': return `after the set date, ${who(node)} sign`;
    case 'rcsv': return `after the delay, ${who(node)} sign`;
    case 'multisig': return `${p.required ?? 'M'}-of-${Array.isArray(p.pubkeys) ? p.pubkeys.length : 'N'} keys sign`;
    case 'oracle': return 'the disclosed Covex oracle co-signs the verified outcome';
    default: return node.kind;
  }
}

// Plain-English description of the whole tree. AND -> "X and Y"; OR -> "either X, or Y".
export function describe(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.node === 'leaf') {
    const base = describeLeaf(node);
    return node.role === 'backstop' ? `${base} (your refund backstop)` : base;
  }
  const parts = (node.children || []).map(describe).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (node.node === 'and') return parts.join(' AND ');
  return `either ${parts.join(', OR ')}`;
}

// Honest enforcement label for a node: on-chain (Kaspa consensus enforces the spend rule) vs
// oracle-attested (a disclosed signer is in the path). Never overclaims.
export function enforcementLabel(node) {
  const tier = compositionTier(node);
  return tier === 'oracle_gated'
    ? 'Oracle-attested: a disclosed Covex oracle is in the spend path (not trustless).'
    : 'On-chain: Kaspa consensus enforces the spend rule. No oracle, no custodian.';
}

// A one-line honest summary for the whole covenant (for the deploy confirmation + share card).
export function summarize(node) {
  const tier = compositionTier(node);
  const n = leaves(node).length;
  const kinds = [...new Set(leaves(node).map((l) => LEAF_KINDS[l.kind]?.label || l.kind))];
  return `${n} condition${n === 1 ? '' : 's'} (${kinds.join(', ')}). ${enforcementLabel(node)}`;
}
