// One-shot generator for tests/fixtures/satisfier_golden.json.
// Independent byte derivation (does NOT call buildSatisfier) so the fixture is a
// neutral third party both the Rust and JS satisfier emitters are pinned to.
import { writeFileSync } from 'node:fs';

const SIG_A = new Uint8Array(64).fill(0x11);
const SIG_B = new Uint8Array(64).fill(0x22);
const SIG_REFUND = new Uint8Array(64).fill(0x33);
const SIG_ORACLE = new Uint8Array(64).fill(0x0c);
const PREIMAGE = new Uint8Array(32).fill(0xab);

const OpFalse = 0x00, OpTrue = 0x51, OpData65 = 0x41, OpData32 = 0x20, SIG_HASH_ALL = 0x01;

function cat(...parts) {
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  let n = 0; for (const a of arrs) n += a.length;
  const out = new Uint8Array(n); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
const push65 = (sig) => cat([OpData65], sig, [SIG_HASH_ALL]);     // 0x41 || sig(64) || 0x01
const push32 = (d) => cat([OpData32], d);                         // 0x20 || data(32)
const hex = (u8) => Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');

// Each vector is the satisfier BEFORE the redeem-script trailer.
const V = [
  ['singlesig', 'claim', push65(SIG_A)],
  ['timelock', 'claim', push65(SIG_A)],
  ['rcsv', 'claim', push65(SIG_A)],
  ['hashlock', 'claim', cat(push65(SIG_A), push32(PREIMAGE))],
  ['htlc', 'claim', cat(push65(SIG_A), push32(PREIMAGE), [OpTrue])],
  ['htlc', 'refund', cat(push65(SIG_A), [OpFalse])],
  // multisig 2-of-2, sigs in member (script) order [a, b].
  ['multisig', 'claim', cat(push65(SIG_A), push65(SIG_B))],
  // channel close: bottom->top sig_p2 (=B), sig_p1 (=A), OP_TRUE.
  ['channel', 'close', cat(push65(SIG_B), push65(SIG_A), [OpTrue])],
  ['channel', 'refund', cat(push65(SIG_A), [OpFalse])],
  ['deadman', 'claim', cat(push65(SIG_A), [OpTrue])],   // owner / IF
  ['deadman', 'refund', cat(push65(SIG_A), [OpFalse])], // heir / ELSE
  ['oracle', 'claim', cat(push65(SIG_ORACLE), push65(SIG_A))],
  ['oracle_enforced', 'claim', cat(push65(SIG_ORACLE), push65(SIG_A))],
  ['oracle_escrow', 'revealA', cat(push65(SIG_A), [OpTrue], push65(SIG_ORACLE))],
  ['oracle_escrow', 'revealB', cat(push65(SIG_B), [OpFalse], push65(SIG_ORACLE))],
  ['oracle_enforced_refundable', 'claim', cat(push65(SIG_ORACLE), push65(SIG_A), [OpTrue])],
  ['oracle_enforced_refundable', 'refund', cat(push65(SIG_REFUND), [OpFalse])],
  ['oracle_escrow_refundable', 'revealA', cat(push65(SIG_A), [OpTrue], push65(SIG_ORACLE), [OpTrue])],
  ['oracle_escrow_refundable', 'revealB', cat(push65(SIG_B), [OpFalse], push65(SIG_ORACLE), [OpTrue])],
  ['oracle_escrow_refundable', 'refund', cat(push65(SIG_REFUND), [OpFalse])],
  ['binary_oracle_select', 'revealA', cat(push65(SIG_A), push32(PREIMAGE), [OpTrue])],
  ['binary_oracle_select', 'revealB', cat(push65(SIG_B), push32(PREIMAGE), [OpTrue], [OpFalse])],
  ['binary_oracle_select', 'refund', cat(push65(SIG_REFUND), [OpFalse], [OpFalse])],
];

const obj = {
  _comment: 'GOLDEN cross-language satisfier parity fixture. Each entry is the satisfier bytes (the input signature_script CONTENT before the trailing redeem-script push) for one covenant kind+branch, built from the FIXED inputs below. Both backend/src/covenant_builder.rs assemble_noncustodial_satisfier (via the satisfier_golden_cross_language_parity test) and frontend/src/lib/redeemer/covenantRedeemer.js buildSatisfier (via covenantRedeemer.golden.test.js) are pinned to it: any byte drift on either side fails CI. DO NOT hand-edit hex; regenerate via scripts/gen-satisfier-golden.mjs if the layout intentionally changes, and update BOTH emitters.',
  fixed_inputs: {
    sig_a: hex(SIG_A),
    sig_b: hex(SIG_B),
    sig_refund: hex(SIG_REFUND),
    sig_oracle: hex(SIG_ORACLE),
    preimage: hex(PREIMAGE),
    note: 'sig_a/sig_b/sig_refund/sig_oracle are 64-byte BIP340 signature placeholders; push65 wraps each as 0x41 || sig(64) || 0x01 (SIG_HASH_ALL). preimage is the 32-byte revealed secret; pushData encodes it as 0x20 || data. channel close uses p1=sig_a, p2=sig_b; the satisfier pushes sig_p2 then sig_p1. multisig is 2-of-2 with member-order sigs [sig_a, sig_b]. oracle kinds use the winner=sig_a and the server oracle=sig_oracle.',
  },
  vectors: V.map(([kind, branch, bytes]) => ({ kind, branch, expected_satisfier_hex: hex(bytes) })),
};

writeFileSync('tests/fixtures/satisfier_golden.json', JSON.stringify(obj, null, 2) + '\n', 'utf8');
console.log('wrote tests/fixtures/satisfier_golden.json with', V.length, 'vectors');
for (const v of obj.vectors) console.log(' ', v.kind, v.branch, '=', v.expected_satisfier_hex.length / 2, 'bytes');
