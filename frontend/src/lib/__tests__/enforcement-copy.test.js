import { describe, it, expect } from 'vitest';
import {
  REALITY_HEADLINE,
  REALITY_BODY,
  REALITY_BADGE_LABEL,
  REALITY_VERB,
  KNOWN_REALITIES,
  enforcementSummary,
} from '../enforcement-copy.js';

// Honesty-copy is enforced in code, not just in CI. The em-dash gate already blocks pushes;
// this test guards the inverse: the canonical enforcement labels must never claim more than
// the on-chain reality delivers. Specifically, "trustless" is only honest for genuine
// consensus-enforced primitives, and the oracle-cosigned realities ("oracle-attested",
// "hybrid", "full-zk") must never use the bare word in their body copy.
const REALITY_KEYS = Array.from(KNOWN_REALITIES);
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

  it('returns a non-empty oracleNote for full-zk that references off-chain verification and never a Covex oracle', () => {
    const s = enforcementSummary('full-zk');
    expect(s).toBeTruthy();
    expect(typeof s.oracleNote).toBe('string');
    expect(s.oracleNote.length).toBeGreaterThan(0);
    expect(s.oracleNote.toLowerCase()).not.toContain('covex oracle');
    expect(s.oracleNote).toMatch(/external resolver|off-chain/i);
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

describe('full-zk-chain removal honesty', () => {
  it('KNOWN_REALITIES does NOT contain the removed full-zk-chain tier', () => {
    // The "Chain-enforced ZK" / full-zk-chain tier was a documented overclaim: no deployed
    // circuit's ZK proof is bound to a chain-checked hashlock, so it was removed. This guards
    // against it being reintroduced into the canonical gating set.
    expect(REALITY_KEYS).not.toContain('full-zk-chain');
    expect(KNOWN_REALITIES.has('full-zk-chain')).toBe(false);
  });

  it('the canonical reality set is on-chain / hybrid / oracle-attested / full-zk / on-chain-zk', () => {
    // The honest tiers: the four off-chain/oracle realities plus the distinct on-chain-zk tier
    // (KIP-16 zk_game_settle, verified by Kaspa consensus). full-zk stays the strongest OFF-CHAIN
    // ZK label (oracle-verified off-chain); on-chain-zk is a SEPARATE on-chain-verified tier and
    // does NOT resurrect the retired full-zk-chain overclaim.
    expect(REALITY_KEYS.slice().sort()).toEqual(
      ['full-zk', 'hybrid', 'on-chain', 'on-chain-zk', 'oracle-attested'],
    );
    for (const key of REALITY_KEYS) {
      expect(typeof REALITY_HEADLINE[key], `REALITY_HEADLINE missing ${key}`).toBe('string');
      expect(typeof REALITY_BODY[key], `REALITY_BODY missing ${key}`).toBe('string');
      expect(typeof REALITY_BADGE_LABEL[key], `REALITY_BADGE_LABEL missing ${key}`).toBe('string');
      expect(typeof REALITY_VERB[key], `REALITY_VERB missing ${key}`).toBe('string');
    }
  });

  it('full-zk-chain has no entry in any reality dictionary (no resurrected dead tier)', () => {
    expect(REALITY_HEADLINE['full-zk-chain']).toBeUndefined();
    expect(REALITY_BODY['full-zk-chain']).toBeUndefined();
    expect(REALITY_BADGE_LABEL['full-zk-chain']).toBeUndefined();
    expect(REALITY_VERB['full-zk-chain']).toBeUndefined();
  });

  it('enforcementSummary("full-zk-chain") collapses to the on-chain fallback (unknown key)', () => {
    // full-zk-chain is no longer a known reality, so the gating function falls back to its
    // on-chain default. It must NOT resurrect a distinct chain-enforced ZK summary.
    const s = enforcementSummary('full-zk-chain');
    expect(s).toBeTruthy();
    expect(s.headline).toBe(REALITY_HEADLINE['on-chain']);
    expect(s.body).toBe(REALITY_BODY['on-chain']);
    expect(s.badge).toBe(REALITY_BADGE_LABEL['on-chain']);
  });

  it('full-zk badge collapses the path: the strongest ZK label is "Full ZK", oracle-verified off-chain', () => {
    // With full-zk-chain removed, full-zk is the terminal ZK tier. Its badge is "Full ZK" and
    // its body must keep the explicit off-chain / not-chain-enforced carve-out (asserted below).
    expect(REALITY_BADGE_LABEL['full-zk']).toBe('Full ZK');
    expect(REALITY_VERB['full-zk']).toMatch(/off-chain/i);
  });

  it('full-zk body must explicitly say "Not chain-enforced end-to-end"', () => {
    const body = REALITY_BODY['full-zk'];
    expect(body).toBeTruthy();
    expect(body).toContain('Not chain-enforced end-to-end');
  });

  it('full-zk body must NOT claim it is chain-enforced end-to-end without the "Not" carve-out', () => {
    // Symmetric guard: the regression of removing "Not" or rewriting the carve-out into a
    // bare positive claim ("chain-enforced end-to-end") would be an overclaim. We allow the
    // string only when it appears inside the explicit negation "Not chain-enforced end-to-end".
    const body = REALITY_BODY['full-zk'];
    expect(body).toBeTruthy();
    const residue = body.split('Not chain-enforced end-to-end').join('');
    expect(
      /chain-enforced end-to-end/i.test(residue),
      'REALITY_BODY["full-zk"] claims "chain-enforced end-to-end" outside the "Not" carve-out',
    ).toBe(false);
  });
});

describe('on-chain-zk tier honesty (KIP-16 zk_game_settle)', () => {
  it('is a known reality with a full set of dictionary entries', () => {
    expect(KNOWN_REALITIES.has('on-chain-zk')).toBe(true);
    expect(typeof REALITY_HEADLINE['on-chain-zk']).toBe('string');
    expect(typeof REALITY_BODY['on-chain-zk']).toBe('string');
    expect(typeof REALITY_BADGE_LABEL['on-chain-zk']).toBe('string');
    expect(typeof REALITY_VERB['on-chain-zk']).toBe('string');
  });

  it('body cites on-chain consensus verification and KIP-16, with no oracle/co-sign in payout', () => {
    const body = REALITY_BODY['on-chain-zk'];
    expect(/on-chain/i.test(body)).toBe(true);
    expect(/consensus/i.test(body)).toBe(true);
    expect(/KIP-16/.test(body)).toBe(true);
    // The whole point of this tier: no oracle and no co-signature in the payout path.
    expect(/no oracle/i.test(body)).toBe(true);
  });

  it('stays explicitly testnet / Toccata gated and never reads as mainnet-live', () => {
    // The headline, badge, verb, and body must all keep the testnet gate so the tier can never
    // be mistaken for a shipped mainnet capability (OpZkPrecompile is not live on Kaspa mainnet).
    for (const dict of [REALITY_HEADLINE, REALITY_BADGE_LABEL, REALITY_VERB]) {
      expect(/testnet/i.test(dict['on-chain-zk'])).toBe(true);
    }
    const body = REALITY_BODY['on-chain-zk'];
    expect(/testnet|toccata/i.test(body)).toBe(true);
    // Must NOT assert a POSITIVE mainnet-live guarantee. The honest NEGATION
    // ("not live on Kaspa mainnet yet") is fine and is preserved, so strip any
    // "not ... live on mainnet" carve-out before scanning for a bare claim.
    const residue = body.replace(/not live on (kaspa )?mainnet[^.]*/gi, '');
    expect(/live on (kaspa )?mainnet|mainnet-?live|on mainnet today/i.test(residue)).toBe(false);
  });

  it('enforcementSummary("on-chain-zk") has no oracle note (no oracle in the loop)', () => {
    const s = enforcementSummary('on-chain-zk');
    expect(s).toBeTruthy();
    expect(s.oracleNote).toBe('');
    expect(s.headline).toBe(REALITY_HEADLINE['on-chain-zk']);
  });
});
