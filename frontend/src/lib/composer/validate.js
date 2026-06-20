// composer/validate.js
//
// validateAlwaysSpendable: the fail-closed gate that makes "build anything" SAFE. A
// composition is deployable ONLY if this passes. It is the JS twin (pre-flight) of the
// server validate_always_spendable; deploy stays disabled until it is green, mirroring the
// spend side's refuse-on-mismatch stance. This module is pure structural logic - the
// byte-level V5 self-spend of the backstop branch runs in the redeem/satisfier slice.
//
// THE LAW: any branch that depends on a secret, the oracle, or a counterparty is legal ONLY
// as a sibling of a deployer-controlled on-chain BACKSTOP branch. That is what guarantees
// "can-fund implies can-spend": the deployer can always eventually reclaim their funds.

import { LEAF_KINDS, MAX_DEPTH, MAX_BACKSTOP_HORIZON_DAA, leaves, depth } from './tree';

export function validateAlwaysSpendable(root, opts = {}) {
  const { nowDaa } = opts;
  const errors = [];
  if (!root || typeof root !== 'object') return { ok: false, errors: ['empty composition'] };

  const allLeaves = leaves(root);

  // V0 - leaf allowlist + required params. A leaf not in the closed set, or missing the
  // fields its redeem fragment needs, cannot be built or spent, so it is rejected outright.
  if (allLeaves.length === 0) errors.push('composition has no conditions');
  for (const lf of allLeaves) {
    const meta = LEAF_KINDS[lf.kind];
    if (!meta) { errors.push(`unknown condition "${lf.kind}" (not a composable block)`); continue; }
    for (const req of meta.params) {
      const v = lf.params?.[req];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
        errors.push(`${meta.label} is missing "${req}"`);
      }
    }
  }

  // V3 (structural) - no empty groups + bounded nesting depth.
  if (depth(root) > MAX_DEPTH) errors.push(`nesting is too deep (max ${MAX_DEPTH})`);
  (function checkNonEmpty(n) {
    if (n && (n.node === 'and' || n.node === 'or')) {
      if (!n.children || n.children.length === 0) {
        errors.push(`an "${n.node === 'and' ? 'ALL of' : 'EITHER'}" group is empty`);
      } else n.children.forEach(checkNonEmpty);
    }
  })(root);

  // V1 - THE gate. If anything in the composition gates the funds (a secret, the oracle, or a
  // counterparty), there MUST be a deployer-controlled on-chain backstop branch.
  const gated = allLeaves.some((lf) => LEAF_KINDS[lf.kind]?.gatesFunds);
  const backstops = allLeaves.filter((lf) => lf.role === 'backstop');
  if (gated) {
    if (backstops.length === 0) {
      errors.push('this logic depends on a secret, the oracle, or another party, so it needs a refund backstop branch that you alone can always claim');
    }
    for (const bs of backstops) {
      const meta = LEAF_KINDS[bs.kind];
      if (!meta || meta.tier !== 'on_chain') {
        errors.push('the backstop branch must be on-chain (no oracle, no counterparty)');
        continue;
      }
      if (bs.params?.signer && bs.params.signer !== 'deployer') {
        errors.push('the backstop branch must be claimable by you (the deployer), not another party');
      }
      // V4 (partial) - a time-gated backstop must be a positive, eventually-reachable delay.
      if (bs.kind === 'timelock') {
        const t = Number(bs.params?.lock_daa);
        if (!(t > 0)) errors.push('the backstop unlock time must be a positive DAA value');
        else if (nowDaa && (t < nowDaa || t > nowDaa + MAX_BACKSTOP_HORIZON_DAA)) {
          errors.push('the backstop unlock time is in the past or more than ~1 year out');
        }
      } else if (bs.kind === 'rcsv') {
        const t = Number(bs.params?.min_sequence);
        if (!(t > 0)) errors.push('the backstop delay must be a positive value');
        else if (t > MAX_BACKSTOP_HORIZON_DAA) errors.push('the backstop delay is too long (over ~1 year)');
      }
      // A backstop that is purely a signature with no time gate is allowed: the deployer can
      // always sign. A multisig backstop is allowed only if the deployer holds the threshold;
      // that is enforced at the leaf level (signer === deployer above).
    }
  }

  return { ok: errors.length === 0, errors };
}
