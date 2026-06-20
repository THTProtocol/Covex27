// covenantRedeemer.golden.test.js
//
// CROSS-LANGUAGE SATISFIER GOLDEN PARITY (frontend half of the consensus-critical
// money-path gate). This pins the pure-core `buildSatisfier` output, for every covenant
// kind+branch it supports, to the SAME shared golden fixture the BACKEND
// `assemble_noncustodial_satisfier` is pinned to:
//
//   tests/fixtures/satisfier_golden.json   (at the repo root)
//
// The Rust half is backend/src/covenant_builder.rs::satisfier_golden_cross_language_parity.
// Both emitters compare against this one neutral file with FIXED inputs, so any byte drift
// on EITHER side (a reordered push, a flipped selector, a changed push encoding) fails CI.
//
// IMPORTANT: this imports ONLY the pure core of covenantRedeemer.js (no '@onekeyfe/kaspa-wasm'),
// so `npm test` never loads the ~15MB wasm. The fixture is read with node:fs at an absolute
// path derived from import.meta.url, so it resolves regardless of the vitest working directory.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildSatisfier } from './covenantRedeemer.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// frontend/src/lib/redeemer -> repo root is five levels up.
const FIXTURE = resolve(HERE, '..', '..', '..', '..', 'tests', 'fixtures', 'satisfier_golden.json');

const golden = JSON.parse(readFileSync(FIXTURE, 'utf8'));

function hexToBytes(h) {
  return Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
}
function bytesToHex(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
  return s;
}

const fi = golden.fixed_inputs;
const SIG_A = hexToBytes(fi.sig_a);
const SIG_B = hexToBytes(fi.sig_b);
const SIG_REFUND = hexToBytes(fi.sig_refund);
const SIG_ORACLE = hexToBytes(fi.sig_oracle);
const PRE = hexToBytes(fi.preimage);

// Map (kind, branch) -> the buildSatisfier args that route the FIXED placeholders into the
// slots the branch consumes. Mirrors the backend test's slot mapping exactly:
//   channel close: p1=sig_a, p2=sig_b (the satisfier pushes sig_p2 then sig_p1)
//   multisig 2-of-2: member-order sigs [sig_a, sig_b]
//   oracle kinds: winner=sig_a, server oracle=sig_oracle
function argsFor(kind, branch) {
  switch (`${kind}:${branch}`) {
    case 'singlesig:claim':
    case 'timelock:claim':
    case 'rcsv:claim':
      return { kind, sig65: SIG_A };
    case 'hashlock:claim':
      return { kind, sig65: SIG_A, preimageBytes: PRE };
    case 'htlc:claim':
      return { kind, branch: 'claim', sig65: SIG_A, preimageBytes: PRE };
    case 'htlc:refund':
      return { kind, branch: 'refund', sig65: SIG_A };
    case 'multisig:claim':
      return { kind, multisigSigs: [SIG_A, SIG_B] };
    case 'channel:close':
      return { kind, branch: 'close', channelSig1: SIG_A, channelSig2: SIG_B };
    case 'channel:refund':
      return { kind, branch: 'refund', channelSig1: SIG_A };
    case 'deadman:claim':
      return { kind, branch: 'claim', sig65: SIG_A };
    case 'deadman:refund':
      return { kind, branch: 'refund', sig65: SIG_A };
    case 'oracle:claim':
    case 'oracle_enforced:claim':
      return { kind, oracleSig: SIG_ORACLE, winnerSig: SIG_A };
    case 'oracle_escrow:revealA':
      return { kind, winnerIsA: true, winnerSig: SIG_A, oracleSig: SIG_ORACLE };
    case 'oracle_escrow:revealB':
      return { kind, winnerIsA: false, winnerSig: SIG_B, oracleSig: SIG_ORACLE };
    case 'oracle_enforced_refundable:claim':
      return { kind, branch: 'claim', oracleSig: SIG_ORACLE, winnerSig: SIG_A };
    case 'oracle_enforced_refundable:refund':
      return { kind, branch: 'refund', refundSig: SIG_REFUND };
    case 'oracle_escrow_refundable:revealA':
      return { kind, branch: 'revealA', winnerIsA: true, winnerSig: SIG_A, oracleSig: SIG_ORACLE };
    case 'oracle_escrow_refundable:revealB':
      return { kind, branch: 'revealB', winnerIsA: false, winnerSig: SIG_B, oracleSig: SIG_ORACLE };
    case 'oracle_escrow_refundable:refund':
      return { kind, branch: 'refund', refundSig: SIG_REFUND };
    case 'binary_oracle_select:revealA':
      return { kind, branch: 'revealA', winnerIsA: true, winnerSig: SIG_A, preimageBytes: PRE };
    case 'binary_oracle_select:revealB':
      return { kind, branch: 'revealB', winnerIsA: false, winnerSig: SIG_B, preimageBytes: PRE };
    case 'binary_oracle_select:refund':
      return { kind, branch: 'refund', refundSig: SIG_REFUND };
    default:
      throw new Error(`golden fixture has a vector this test does not map: ${kind}/${branch}`);
  }
}

describe('buildSatisfier cross-language golden parity', () => {
  it('the fixture is well-formed (fixed inputs + non-empty vectors)', () => {
    expect(SIG_A.length).toBe(64);
    expect(SIG_B.length).toBe(64);
    expect(SIG_REFUND.length).toBe(64);
    expect(SIG_ORACLE.length).toBe(64);
    expect(PRE.length).toBe(32);
    expect(Array.isArray(golden.vectors)).toBe(true);
    expect(golden.vectors.length).toBeGreaterThan(0);
  });

  // One assertion per fixture vector: buildSatisfier output must equal the golden hex BYTE
  // for byte. The same fixture is asserted in Rust, so a drift on either side breaks CI.
  for (const v of golden.vectors) {
    it(`${v.kind} / ${v.branch} matches the golden satisfier hex`, () => {
      const got = bytesToHex(buildSatisfier(argsFor(v.kind, v.branch)));
      expect(got).toBe(v.expected_satisfier_hex);
    });
  }

  it('covers all 23 supported kind/branch vectors (no silent gap)', () => {
    expect(golden.vectors.length).toBe(23);
  });
});
