// composer/satisfier.js
//
// The SPEND-side composition engine: given a composition tree + a chosen branch + the
// per-leaf inputs, emit the exact satisfier bytes (the signature_script content before the
// trailing redeem-script push). This is the recursive generalization of the hand-written
// per-kind arms in covenantRedeemer.js buildSatisfier / Rust assemble_noncustodial_satisfier.
//
// It is PROVEN byte-for-byte by composer.satisfier.test.js, which reconstructs the existing
// htlc / channel / deadman / binary_oracle_select golden vectors (tests/fixtures/
// satisfier_golden.json, the neutral Rust+JS parity fixture) purely from atomic composition.
// If composing atomics reproduces those already-deployed, already-proven bytes, the engine is
// correct. No new crypto: the leaf fragments and push helpers are the existing, golden-pinned
// ones; only the two combinators (AND-reverse, OR + branchSelectors) are new.

import { OPCODES, push65, pushData } from '../redeemer/covenantRedeemer';

/**
 * Selector bytes that navigate a right-nested OP_IF/OP_ELSE ladder to branch k of n,
 * in PUSH order (bottom of the selector group first, outermost selector on top).
 *
 * Ladder `IF b0 ELSE IF b1 ELSE ... ELSE b_{n-1}` has n-1 IFs. Reaching b0 needs the
 * outermost IF to pop TRUE; reaching b_{k>0} needs it to pop FALSE then the inner
 * (n-1)-way ladder to reach k-1. So selectors(n,k) = selectors(n-1,k-1) ++ [FALSE], with
 * selectors(n,0)=[TRUE]. Verified against the bos goldens: A=[T], B=[T,F], refund=[F,F].
 */
export function branchSelectors(n, k) {
  if (n <= 1) return new Uint8Array(0); // single branch is not an OR; no selector
  if (k < 0 || k >= n) throw new Error(`branch ${k} out of range for ${n} branches`);
  if (k === 0) return Uint8Array.from([OPCODES.OpTrue]);
  const inner = branchSelectors(n - 1, k - 1);
  const out = new Uint8Array(inner.length + 1);
  out.set(inner, 0);
  out[inner.length] = OPCODES.OpFalse;
  return out;
}

function cat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// The satisfier inputs a single LEAF consumes, in stack-push order (bottom first). Mirrors
// the existing per-kind arms exactly. `inp` carries the signature(s) + optional preimage the
// spender provides for THIS leaf.
//   singlesig / timelock / rcsv : [ push65(sig) ]
//   hashlock                    : [ push65(sig), pushData(preimage) ]   (preimage on top)
//   multisig                    : [ push65(sig) for each member sig, in script order ]
function leafSatisfier(kind, inp) {
  switch (kind) {
    case 'singlesig':
    case 'timelock':
    case 'rcsv':
      if (!inp?.sig) throw new Error(`${kind} leaf needs a signature`);
      return [push65(inp.sig)];
    case 'hashlock':
      if (!inp?.sig) throw new Error('hashlock leaf needs a signature');
      if (!inp?.preimage) throw new Error('hashlock leaf needs a preimage');
      return [push65(inp.sig), pushData(inp.preimage)];
    case 'multisig': {
      if (!Array.isArray(inp?.sigs) || inp.sigs.length === 0) throw new Error('multisig leaf needs sigs[]');
      return inp.sigs.map((s) => push65(s));
    }
    default:
      throw new Error(`leaf kind "${kind}" is not satisfiable in this slice`);
  }
}

/**
 * Recursively build the satisfier for a composition `node` along the chosen branch `plan`.
 *
 * plan mirrors the tree:
 *   LEAF: { sig, preimage?, sigs? }            - the inputs for this leaf
 *   AND:  { children: [plan per child] }       - ALL children satisfied; output is REVERSED
 *   OR:   { take: k, child: plan }             - branch k chosen; child plan satisfies it
 *
 * AND reverses child order so child[0]'s inputs end up on TOP of the stack (its Verify runs
 * first). OR appends branchSelectors(n,k) after the chosen child's satisfier.
 */
export function buildComposedSatisfier(node, plan) {
  if (!node || typeof node !== 'object') throw new Error('bad node');
  if (node.node === 'leaf') {
    return cat(leafSatisfier(node.kind, plan || {}));
  }
  if (node.node === 'and') {
    const kids = node.children || [];
    if (!plan?.children || plan.children.length !== kids.length) throw new Error('AND plan must cover every child');
    const parts = [];
    for (let i = kids.length - 1; i >= 0; i--) parts.push(buildComposedSatisfier(kids[i], plan.children[i]));
    return cat(parts);
  }
  if (node.node === 'or') {
    const kids = node.children || [];
    const k = plan?.take;
    if (typeof k !== 'number' || k < 0 || k >= kids.length) throw new Error('OR plan must choose a valid branch (take)');
    return cat([buildComposedSatisfier(kids[k], plan.child), branchSelectors(kids.length, k)]);
  }
  throw new Error(`unknown node "${node.node}"`);
}
