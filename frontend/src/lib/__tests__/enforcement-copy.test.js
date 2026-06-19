import { describe, it, expect } from 'vitest';
import {
  REALITY_HEADLINE,
  REALITY_BODY,
  REALITY_BADGE_LABEL,
  REALITY_VERB,
  enforcementSummary,
} from '../enforcement-copy.js';

// Honesty-copy is enforced in code, not just in CI. The em-dash gate already blocks pushes;
// this test guards the inverse: the canonical enforcement labels must never claim more than
// the on-chain reality delivers. Specifically, "trustless" is only honest for genuine
// consensus-enforced primitives, and the oracle-cosigned realities ("oracle-attested",
// "hybrid", "full-zk") must never use the bare word in their body copy.
const REALITY_KEYS = ['on-chain', 'oracle-attested', 'hybrid', 'full-zk', 'metadata'];
const EM_DASH = /—/;
const ORACLE_COSIGNED_KEYS = ['oracle-attested', 'hybrid', 'full-zk'];
// The two literal phrases where "trustless" is acceptable: they negate the claim or scope it
// to the on-chain layer (e.g. "Not on-chain trustless: ..."). Any other occurrence of the
// bare word in oracle-cosigned body copy is an overclaim and must fail this test.
const TRUSTLESS_CARVEOUTS = ['not trustless', 'Not on-chain trustless'];

function stripCarveouts(body) {
  let s = body;
  for (const phrase of TRUSTLESS_CARVEOUTS) {
    s = s.split(phrase).join('');
  }
  return s;
}

describe('enforcement copy honesty', () => {
  it('contains no em-dash in any reality dictionary entry', () => {
    const dicts = { REALITY_HEADLINE, REALITY_BODY, REALITY_BADGE_LABEL, REALITY_VERB };
    for (const [dictName, dict] of Object.entries(dicts)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(
          EM_DASH.test(String(value)),
          `${dictName}[${JSON.stringify(key)}] contains an em-dash`,
        ).toBe(false);
      }
    }
  });

  it('never uses bare "trustless" in oracle-cosigned realities outside the explicit carve-outs', () => {
    for (const key of ORACLE_COSIGNED_KEYS) {
      const body = REALITY_BODY[key];
      expect(typeof body, `REALITY_BODY[${JSON.stringify(key)}] must be a string`).toBe('string');
      const residue = stripCarveouts(body);
      expect(
        /trustless/i.test(residue),
        `REALITY_BODY[${JSON.stringify(key)}] uses "trustless" outside the allowed carve-outs`,
      ).toBe(false);
    }
  });
});

describe('enforcementSummary', () => {
  it('returns no oracleNote for on-chain (consensus enforces it, no oracle in the loop)', () => {
    const s = enforcementSummary('on-chain');
    expect(s).toBeTruthy();
    expect(s.oracleNote).toBe('');
  });

  it('returns a non-empty oracleNote for full-zk that names the disclosed Covex oracle', () => {
    const s = enforcementSummary('full-zk');
    expect(s).toBeTruthy();
    expect(typeof s.oracleNote).toBe('string');
    expect(s.oracleNote.length).toBeGreaterThan(0);
    expect(s.oracleNote).toContain('disclosed Covex oracle');
  });

  it('returns a sensible default for an unknown reality without throwing', () => {
    let s;
    expect(() => {
      s = enforcementSummary('made-up-reality');
    }).not.toThrow();
    expect(s).toBeTruthy();
    // Sensible default: shape matches the real summaries (object with at least an oracleNote
    // string). The unknown path must not invent enforcement claims, so oracleNote should be
    // a string the caller can render safely.
    expect(typeof s.oracleNote).toBe('string');
  });

  it('also handles missing/null reality input without throwing', () => {
    expect(() => enforcementSummary(undefined)).not.toThrow();
    expect(() => enforcementSummary(null)).not.toThrow();
  });
});

describe('full-zk-chain honesty', () => {
  it('exists in all four reality dictionaries (headline, body, badge, verb)', () => {
    expect(typeof REALITY_HEADLINE['full-zk-chain']).toBe('string');
    expect(REALITY_HEADLINE['full-zk-chain'].length).toBeGreaterThan(0);
    expect(typeof REALITY_BODY['full-zk-chain']).toBe('string');
    expect(REALITY_BODY['full-zk-chain'].length).toBeGreaterThan(0);
    expect(typeof REALITY_BADGE_LABEL['full-zk-chain']).toBe('string');
    expect(REALITY_BADGE_LABEL['full-zk-chain'].length).toBeGreaterThan(0);
    expect(typeof REALITY_VERB['full-zk-chain']).toBe('string');
    expect(REALITY_VERB['full-zk-chain'].length).toBeGreaterThan(0);
  });

  it('full-zk-chain body must NOT claim oracle-cosigned payout (it is chain-enforced)', () => {
    const body = REALITY_BODY['full-zk-chain'];
    expect(body).toBeTruthy();
    expect(
      /oracle-cosigned/i.test(body),
      'REALITY_BODY["full-zk-chain"] must not say "oracle-cosigned" (the chain enforces it)',
    ).toBe(false);
    expect(
      /oracle co-signature/i.test(body),
      'REALITY_BODY["full-zk-chain"] must not say "oracle co-signature" (the chain enforces it)',
    ).toBe(false);
  });

  it('full-zk body must explicitly say "Not chain-enforced end-to-end"', () => {
    const body = REALITY_BODY['full-zk'];
    expect(body).toBeTruthy();
    expect(body).toContain('Not chain-enforced end-to-end');
  });
});
