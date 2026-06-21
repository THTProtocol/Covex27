import { describe, it, expect, vi, beforeEach } from 'vitest';

// ZK STUDIO PROVER HONESTY TEST.
//
// studioProvers.js is the standalone, server-free in-browser prove + verify engine behind the ZK
// Studio page. The REAL Groth16 prove/verify is exercised live in the browser (it needs the served
// wasm/zkey/vkey), so this unit test pins the parts that must be correct WITHOUT snarkjs:
//   1. the editable input schema + defaults are well-formed for every flagship circuit;
//   2. a FALSE statement (age below min, balance below min, value out of range, sum below threshold,
//      timelock not reached) is REFUSED in prepare() before any proof is attempted - the circuit
//      never proves a lie;
//   3. malformed input (non-numeric) is rejected with a friendly error;
//   4. studioProveAndVerify actually calls snarkjs.groth16.verify against the fetched vkey and
//      surfaces its boolean - it is a real verify, not a rubber-stamp true.
//
// We mock the two module boundaries (./provers for loadSnarkjs/covenantFieldElement, global fetch
// for the vkey) so the pure logic is testable headless. mimc7 + poseidon-lite are real (pure JS).

const verifyMock = vi.fn();
const fullProveMock = vi.fn();

vi.mock('../provers', () => ({
  loadSnarkjs: async () => ({
    groth16: {
      fullProve: fullProveMock,
      verify: verifyMock,
    },
  }),
  // Deterministic stand-in for the covenant field-element binding.
  covenantFieldElement: async () => '7',
}));

import {
  STUDIO_CIRCUITS,
  STUDIO_FLAGSHIP_ORDER,
  studioFieldDefaults,
  studioProveAndVerify,
} from '../studioProvers';

beforeEach(() => {
  verifyMock.mockReset();
  fullProveMock.mockReset();
  fullProveMock.mockResolvedValue({ proof: { pi_a: ['1'] }, publicSignals: ['1', '2'] });
  // Mock the served vkey fetch.
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ protocol: 'groth16' }) }));
});

describe('studio flagship schema', () => {
  it('every flagship id has a prover entry with a label, statement and field array', () => {
    for (const id of STUDIO_FLAGSHIP_ORDER) {
      const c = STUDIO_CIRCUITS[id];
      expect(c, `missing STUDIO_CIRCUITS[${id}]`).toBeTruthy();
      expect(typeof c.label).toBe('string');
      expect(typeof c.statement).toBe('string');
      expect(Array.isArray(c.fields)).toBe(true);
      expect(typeof c.prepare).toBe('function');
    }
  });

  it('field defaults are keyed by every declared field', () => {
    for (const id of STUDIO_FLAGSHIP_ORDER) {
      const defaults = studioFieldDefaults(id);
      for (const f of STUDIO_CIRCUITS[id].fields) {
        expect(defaults).toHaveProperty(f.key);
      }
    }
  });

  it('no statement or note uses an em dash (CI honesty gate)', () => {
    for (const id of Object.keys(STUDIO_CIRCUITS)) {
      expect(STUDIO_CIRCUITS[id].statement.includes('—')).toBe(false);
    }
  });
});

describe('false statements are refused before proving (never proves a lie)', () => {
  it('age_verification refuses when age is below the minimum', async () => {
    await expect(
      studioProveAndVerify('age_verification', { birth_year: '2020', min_age: '18', current_year: '2026' }),
    ).rejects.toThrow(/false/i);
    expect(fullProveMock).not.toHaveBeenCalled();
  });

  it('balance_threshold refuses when balance is below the minimum', async () => {
    await expect(
      studioProveAndVerify('balance_threshold', { balance: '500', min_balance: '10000' }),
    ).rejects.toThrow(/false/i);
    expect(fullProveMock).not.toHaveBeenCalled();
  });

  it('range_proof refuses a value outside the range', async () => {
    await expect(
      studioProveAndVerify('range_proof', { value: '999', min: '0', max: '100' }),
    ).rejects.toThrow(/false/i);
  });

  it('solvency_sum refuses when buckets sum below the threshold', async () => {
    await expect(
      studioProveAndVerify('solvency_sum', { a0: '1', a1: '1', a2: '1', a3: '1', threshold: '60000' }),
    ).rejects.toThrow(/false/i);
  });

  it('timelock_absolute refuses when the threshold is not reached', async () => {
    await expect(
      studioProveAndVerify('timelock_absolute', { current_daa: '100', lock_threshold: '1000' }),
    ).rejects.toThrow(/false/i);
  });
});

describe('malformed input is rejected with a friendly error', () => {
  it('non-numeric value throws a whole-number error', async () => {
    await expect(
      studioProveAndVerify('range_proof', { value: 'abc', min: '0', max: '100' }),
    ).rejects.toThrow(/whole number/i);
  });
});

describe('verify is real (not a rubber stamp)', () => {
  it('runs groth16.verify against the fetched vkey and returns its boolean', async () => {
    verifyMock.mockResolvedValue(true);
    const r = await studioProveAndVerify('age_verification', { birth_year: '1990', min_age: '18', current_year: '2026' });
    expect(fullProveMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledTimes(1);
    // verify must be called with (vkey, publicSignals, proof)
    const [vkey, signals, proof] = verifyMock.mock.calls[0];
    expect(vkey).toEqual({ protocol: 'groth16' });
    expect(signals).toEqual(['1', '2']);
    expect(proof).toEqual({ pi_a: ['1'] });
    expect(r.verified).toBe(true);
  });

  it('surfaces a false verify result honestly (fail-closed)', async () => {
    verifyMock.mockResolvedValue(false);
    const r = await studioProveAndVerify('age_verification', { birth_year: '1990', min_age: '18', current_year: '2026' });
    expect(r.verified).toBe(false);
  });

  it('binds the witness to the covenant field element (H4 slot the wasm requires)', async () => {
    verifyMock.mockResolvedValue(true);
    await studioProveAndVerify('age_verification', { birth_year: '1990', min_age: '18', current_year: '2026' });
    const witness = fullProveMock.mock.calls[0][0];
    expect(witness.covenantId).toBe('7'); // from the mocked covenantFieldElement
  });

  it('throws if the vkey cannot be fetched (no fake verify)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    await expect(
      studioProveAndVerify('age_verification', { birth_year: '1990', min_age: '18', current_year: '2026' }),
    ).rejects.toThrow(/verification key/i);
  });
});
