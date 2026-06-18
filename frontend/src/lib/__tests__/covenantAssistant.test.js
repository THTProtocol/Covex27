import { describe, it, expect } from 'vitest';
import { suggestCovenants } from '../covenantAssistant.js';

// A small, real-shaped catalog. The assistant must only ever return circuits that EXIST here
// (it is honest by construction: it cannot invent a circuit or overclaim).
const CIRCUITS = [
  { id: 'escrow_2party', name: 'Two-party escrow', description: 'escrow with timeout refund', category: 'defi', reality: 'full-zk' },
  { id: 'age_verification', name: 'Age verification', description: 'prove an age threshold without revealing the birth date', category: 'crypto', reality: 'full-zk' },
  { id: 'merkle_membership', name: 'Merkle membership', description: 'prove whitelist membership', category: 'crypto', reality: 'full-zk' },
  { id: 'prediction_market', name: 'Prediction market', description: 'bet on a resolved outcome', category: 'oracle', reality: 'oracle-attested' },
];

describe('suggestCovenants', () => {
  it('returns nothing for an empty query or empty catalog', () => {
    expect(suggestCovenants('', CIRCUITS)).toEqual([]);
    expect(suggestCovenants('escrow', [])).toEqual([]);
  });

  it('maps an escrow goal to the real escrow circuit with high confidence', () => {
    const r = suggestCovenants('hold the funds in escrow until the seller ships', CIRCUITS);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].id).toBe('escrow_2party');
    expect(r[0].confidence).toBe('high');
  });

  it('maps an age goal to age_verification', () => {
    const r = suggestCovenants('prove the user is over 18 without kyc', CIRCUITS);
    expect(r.some((x) => x.id === 'age_verification')).toBe(true);
  });

  it('never invents a circuit: every suggestion exists in the catalog', () => {
    const ids = new Set(CIRCUITS.map((c) => c.id));
    const r = suggestCovenants('whitelist airdrop membership and a prediction market', CIRCUITS);
    expect(r.length).toBeGreaterThan(0);
    for (const s of r) expect(ids.has(s.id)).toBe(true);
  });

  it('caps suggestions at 3 and carries an honest realityNote', () => {
    const r = suggestCovenants('escrow timelock whitelist age range multisig prediction', CIRCUITS);
    expect(r.length).toBeLessThanOrEqual(3);
    for (const s of r) expect(typeof s.realityNote).toBe('string');
  });
});
