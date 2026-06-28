// zkGameSettleSatisfier.golden.test.js
//
// BYTE-PARITY golden test for the KIP-16 zk_game_settle offline-claim satisfier (item 3).
//
// This pins the pure-core buildSatisfier output for zk_game_settle (winner + refund branches)
// to the EXACT byte layout the Rust reference builds:
//
//   backend/src/covenant_builder.rs
//     build_zk_game_settle_winner_satisfier (lines 882-899):
//        satisfier = push65(winner_sig) || push_data_raw(proof) || OpTrue
//     build_zk_game_settle_refund_satisfier (lines 906-915):
//        satisfier = push65(refund_sig) || OpFalse
//
//   where  push65(sig)        = [0x41, ...sig(64), 0x01(SIG_HASH_ALL)]   (covenant_builder.rs:1684)
//          push_data_raw(d)   = ScriptBuilder::add_data(d)              (covenant_builder.rs:684)
//                             = the SAME canonical add_data the JS pushData() mirrors
//          OpTrue  = 0x51,  OpFalse = 0x00
//
// IMPORTANT: this does NOT use the shared tests/fixtures/satisfier_golden.json. That fixture is
// cross-asserted by the Rust satisfier_golden_cross_language_parity test, which routes every
// vector through assemble_noncustodial_satisfier (which does NOT handle zk_game_settle, a
// separate builder). Adding a vector there would break the Rust side. Instead this test re-derives
// the Rust byte order INDEPENDENTLY (the `independentRust*` helpers below) and asserts buildSatisfier
// equals it, so a drift in buildSatisfier is caught without touching the shared fixture.
//
// Imports ONLY the pure core (no '@onekeyfe/kaspa-wasm'), so `npm test` never loads wasm.

import { describe, it, expect } from 'vitest';
import { buildSatisfier } from '../covenantRedeemer.js';

// ----- fixed inputs (mirrors the style of tests/fixtures/satisfier_golden.json) -----
const SIG_WINNER = Uint8Array.from(Array(64).fill(0x11));
const SIG_REFUND = Uint8Array.from(Array(64).fill(0x33));
// A proof long enough (100 bytes) to exercise the OpPushData1 (0x4c) length-prefix path, the way a
// real ark-compressed Groth16 proof (over 75 bytes) would. Any length works for byte-parity.
const PROOF = Uint8Array.from(Array(100).fill(0xab));

const SIG_HASH_ALL = 0x01;
const OP_FALSE = 0x00;
const OP_TRUE = 0x51;
const OP_DATA65 = 0x41;
const OP_PUSHDATA1 = 0x4c;

function bytesToHex(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
  return s;
}
function concat(...parts) {
  const flat = [];
  for (const p of parts) for (const b of p) flat.push(b);
  return Uint8Array.from(flat);
}

// --- INDEPENDENT re-derivation of the Rust byte order (the golden reference) ---

// push65: [0x41, ...sig(64), 0x01]  (covenant_builder.rs::push65)
function independentPush65(sig) {
  if (sig.length !== 64) throw new Error('push65 needs 64 bytes');
  return concat([OP_DATA65], sig, [SIG_HASH_ALL]);
}

// Canonical add_data for the lengths this test uses (1..75 -> [len, data]; 76..255 -> [0x4c, len, data]).
// (covenant_builder.rs::push_data_raw -> ScriptBuilder::add_data; JS pushData mirrors it.)
function independentAddData(d) {
  const len = d.length;
  if (len === 0) return Uint8Array.from([OP_FALSE]);
  if (len <= 75) return concat([len], d);
  if (len <= 255) return concat([OP_PUSHDATA1, len], d);
  throw new Error('this test only needs <=255-byte data');
}

// build_zk_game_settle_winner_satisfier: push65(winner_sig) || add_data(proof) || OP_TRUE
function independentRustWinner(winnerSig, proof) {
  return concat(independentPush65(winnerSig), independentAddData(proof), [OP_TRUE]);
}
// build_zk_game_settle_refund_satisfier: push65(refund_sig) || OP_FALSE
function independentRustRefund(refundSig) {
  return concat(independentPush65(refundSig), [OP_FALSE]);
}

describe('zk_game_settle satisfier byte parity with the Rust reference', () => {
  it('the independent reference is well-formed', () => {
    expect(SIG_WINNER.length).toBe(64);
    expect(SIG_REFUND.length).toBe(64);
    expect(PROOF.length).toBe(100);
  });

  it('winner branch matches build_zk_game_settle_winner_satisfier byte-for-byte', () => {
    const got = buildSatisfier({ kind: 'zk_game_settle', branch: 'claim', winnerSig: SIG_WINNER, preimageBytes: PROOF });
    const golden = independentRustWinner(SIG_WINNER, PROOF);
    expect(bytesToHex(got)).toBe(bytesToHex(golden));
  });

  it('winner branch has the exact documented structure: push65 | OpPushData1+proof | OP_TRUE', () => {
    // Spell the expected hex out literally so a silent change to any helper still fails here.
    const expectedHex =
      // push65(winner_sig) = 0x41 + 64*0x11 + 0x01
      OP_DATA65.toString(16).padStart(2, '0')
      + '11'.repeat(64)
      + '01'
      // add_data(100-byte proof) = 0x4c (OpPushData1) + 0x64 (len=100) + 100*0xab
      + OP_PUSHDATA1.toString(16).padStart(2, '0')
      + (100).toString(16).padStart(2, '0')
      + 'ab'.repeat(100)
      // OP_TRUE
      + '51';
    const got = buildSatisfier({ kind: 'zk_game_settle', branch: 'claim', winnerSig: SIG_WINNER, preimageBytes: PROOF });
    expect(bytesToHex(got)).toBe(expectedHex);
  });

  it('refund branch matches build_zk_game_settle_refund_satisfier byte-for-byte', () => {
    const got = buildSatisfier({ kind: 'zk_game_settle', branch: 'refund', refundSig: SIG_REFUND });
    const golden = independentRustRefund(SIG_REFUND);
    expect(bytesToHex(got)).toBe(bytesToHex(golden));
  });

  it('refund branch has the exact documented structure: push65 | OP_FALSE', () => {
    const expectedHex = '41' + '33'.repeat(64) + '01' + '00';
    const got = buildSatisfier({ kind: 'zk_game_settle', branch: 'refund', refundSig: SIG_REFUND });
    expect(bytesToHex(got)).toBe(expectedHex);
  });

  it('winner spend fails closed without a proof (a wrong satisfier bricks a claim)', () => {
    expect(() =>
      buildSatisfier({ kind: 'zk_game_settle', branch: 'claim', winnerSig: SIG_WINNER }),
    ).toThrow(/proof/i);
  });

  it('winner spend fails closed without a signature', () => {
    expect(() =>
      buildSatisfier({ kind: 'zk_game_settle', branch: 'claim', preimageBytes: PROOF }),
    ).toThrow(/signature/i);
  });

  it('refund spend fails closed without a signature', () => {
    expect(() =>
      buildSatisfier({ kind: 'zk_game_settle', branch: 'refund' }),
    ).toThrow(/signature/i);
  });
});
