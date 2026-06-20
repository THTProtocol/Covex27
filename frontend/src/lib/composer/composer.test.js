import { describe, it, expect } from 'vitest';
import { leaf, allOf, either, canonical, leaves, depth, compositionTier, LEAF_KINDS } from './tree';
import { validateAlwaysSpendable } from './validate';

// The canonical FIRST SLICE: "claimant sweeps by revealing a secret + signing, ELSE the
// deployer reclaims after a CSV delay." This is HTLC with a CSV-relative refund.
const firstSlice = () => either(
  allOf(
    leaf('hashlock', { hash32: 'aa'.repeat(32), pubkey: 'bb'.repeat(32), signer: 'claimant' }),
    leaf('singlesig', { pubkey: 'bb'.repeat(32), signer: 'claimant' }),
  ),
  leaf('rcsv', { min_sequence: 4320, pubkey: 'cc'.repeat(32), signer: 'deployer' }, 'backstop'),
);

describe('composer tree model', () => {
  it('canonical serialization is deterministic + key-order independent', () => {
    const a = leaf('hashlock', { hash32: '11', pubkey: '22' });
    const b = leaf('hashlock', { pubkey: '22', hash32: '11' });
    expect(canonical(a)).toBe(canonical(b));
  });

  it('leaves() walks in DFS script order; depth() is correct', () => {
    const t = firstSlice();
    expect(leaves(t).map((l) => l.kind)).toEqual(['hashlock', 'singlesig', 'rcsv']);
    expect(depth(t)).toBe(3); // or -> and -> leaf
  });

  it('compositionTier is the least-trustless leaf', () => {
    expect(compositionTier(firstSlice())).toBe('on_chain');
    const withOracle = either(leaf('oracle', { oracle: 'oo', winner: 'ww' }), leaf('rcsv', { min_sequence: 10, pubkey: 'cc', signer: 'deployer' }, 'backstop'));
    expect(compositionTier(withOracle)).toBe('oracle_gated');
  });
});

describe('validateAlwaysSpendable - the fail-closed gate', () => {
  it('ACCEPTS the canonical first-slice composition', () => {
    const r = validateAlwaysSpendable(firstSlice());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('V0: rejects an unknown leaf kind', () => {
    const r = validateAlwaysSpendable(leaf('frobnicate', { x: 1 }));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/not a composable block/);
  });

  it('V0: rejects a leaf missing required params', () => {
    const r = validateAlwaysSpendable(leaf('hashlock', { hash32: 'aa' })); // no pubkey + no backstop
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/missing "pubkey"/);
  });

  it('V1: a secret/oracle/counterparty branch WITHOUT a backstop is rejected (anti-stranding)', () => {
    const noBackstop = allOf(
      leaf('hashlock', { hash32: 'aa'.repeat(32), pubkey: 'bb'.repeat(32), signer: 'claimant' }),
      leaf('singlesig', { pubkey: 'bb'.repeat(32), signer: 'claimant' }),
    );
    const r = validateAlwaysSpendable(noBackstop);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/needs a refund backstop/);
  });

  it('V1: a backstop that is oracle-gated is rejected (must be on-chain)', () => {
    const bad = either(
      leaf('hashlock', { hash32: 'aa'.repeat(32), pubkey: 'bb'.repeat(32) }),
      leaf('oracle', { oracle: 'oo', winner: 'ww', signer: 'deployer' }, 'backstop'),
    );
    const r = validateAlwaysSpendable(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/backstop branch must be on-chain/);
  });

  it('V1: a backstop claimable by someone other than the deployer is rejected', () => {
    const bad = either(
      leaf('hashlock', { hash32: 'aa'.repeat(32), pubkey: 'bb'.repeat(32) }),
      leaf('rcsv', { min_sequence: 100, pubkey: 'cc'.repeat(32), signer: 'counterparty' }, 'backstop'),
    );
    const r = validateAlwaysSpendable(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/claimable by you \(the deployer\)/);
  });

  it('V1/V4: a backstop with a non-positive delay is rejected', () => {
    const bad = either(
      leaf('hashlock', { hash32: 'aa'.repeat(32), pubkey: 'bb'.repeat(32) }),
      leaf('rcsv', { min_sequence: 0, pubkey: 'cc'.repeat(32), signer: 'deployer' }, 'backstop'),
    );
    const r = validateAlwaysSpendable(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/backstop delay must be a positive value/);
  });

  it('a pure on-chain composition (no gating leaf) needs NO backstop', () => {
    const r = validateAlwaysSpendable(either(
      leaf('singlesig', { pubkey: 'bb'.repeat(32) }),
      leaf('timelock', { lock_daa: 5000, pubkey: 'cc'.repeat(32) }),
    ));
    expect(r.ok).toBe(true);
  });

  it('structural: rejects an empty group', () => {
    const r = validateAlwaysSpendable(allOf());
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/is empty/);
  });

  it('every LEAF_KINDS entry declares a tier + params (no silent overclaim)', () => {
    for (const [k, m] of Object.entries(LEAF_KINDS)) {
      expect(['on_chain', 'oracle_gated']).toContain(m.tier);
      expect(Array.isArray(m.params)).toBe(true);
      expect(typeof m.gatesFunds).toBe('boolean');
      expect(typeof m.label).toBe('string');
      expect(k).toMatch(/^[a-z]+$/);
    }
  });
});
