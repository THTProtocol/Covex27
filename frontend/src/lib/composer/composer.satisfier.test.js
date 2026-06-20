// composer.satisfier.test.js
//
// PROOF that the composition engine (composer/satisfier.js) is byte-correct: it reconstructs
// the existing, already-deployed, already-proven covenant kinds (htlc, channel, deadman,
// multisig, binary_oracle_select) PURELY from atomic composition, and asserts the bytes equal
// the shared cross-language golden fixture (tests/fixtures/satisfier_golden.json) that both the
// Rust assemble_noncustodial_satisfier and the JS buildSatisfier are already pinned to.
//
// If composing atomics reproduces those bytes, the AND-reversal + OR-ladder + branchSelectors
// are correct against ground truth - no new trust, no new crypto. This is the spend-side gate
// for the composable builder; any drift fails here.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { leaf, allOf, either } from './tree';
import { buildComposedSatisfier, branchSelectors } from './satisfier';
import { OPCODES } from '../redeemer/covenantRedeemer';

const HERE = dirname(fileURLToPath(import.meta.url));
// frontend/src/lib/composer -> repo root is four levels up.
const FIXTURE = resolve(HERE, '..', '..', '..', '..', 'tests', 'fixtures', 'satisfier_golden.json');
const golden = JSON.parse(readFileSync(FIXTURE, 'utf8'));

const hexToBytes = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
const bytesToHex = (u8) => Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');

const fi = golden.fixed_inputs;
const SIG_A = hexToBytes(fi.sig_a);
const SIG_B = hexToBytes(fi.sig_b);
const SIG_REFUND = hexToBytes(fi.sig_refund);
const PRE = hexToBytes(fi.preimage);

// pull a golden satisfier hex by kind+branch
const want = (kind, branch) => {
  const v = golden.vectors.find((e) => e.kind === kind && e.branch === branch);
  if (!v) throw new Error(`golden missing ${kind}/${branch}`);
  return v.expected_satisfier_hex;
};

// Equivalent composition trees for the existing kinds (params are placeholders - only the
// satisfier shape matters for byte parity; signers carried for documentation).
const HTLC = either(
  leaf('hashlock', { hash32: 'h', pubkey: 'r' }),       // claim: receiver reveals preimage + signs
  leaf('timelock', { lock_daa: 1, pubkey: 's' }, 'backstop'), // refund: sender after timeout
);
const CHANNEL = either(
  allOf(leaf('singlesig', { pubkey: 'p1' }), leaf('singlesig', { pubkey: 'p2' })), // close: 2-of-2
  leaf('timelock', { lock_daa: 1, pubkey: 'p1' }, 'backstop'),                       // refund: funder
);
const DEADMAN = either(
  leaf('singlesig', { pubkey: 'owner' }),
  leaf('singlesig', { pubkey: 'heir' }, 'backstop'),
);
const BOS = either(
  leaf('hashlock', { hash32: 'hA', pubkey: 'A' }),
  leaf('hashlock', { hash32: 'hB', pubkey: 'B' }),
  leaf('rcsv', { min_sequence: 1, pubkey: 'refund' }, 'backstop'),
);
const MULTISIG = leaf('multisig', { pubkeys: ['a', 'b'], required: 2 });

describe('branchSelectors matches the proven ladder encodings', () => {
  it('2-way (htlc/channel/deadman): [TRUE], [FALSE]', () => {
    expect(Array.from(branchSelectors(2, 0))).toEqual([OPCODES.OpTrue]);
    expect(Array.from(branchSelectors(2, 1))).toEqual([OPCODES.OpFalse]);
  });
  it('3-way (binary_oracle_select): A=[TRUE], B=[TRUE,FALSE], refund=[FALSE,FALSE]', () => {
    expect(Array.from(branchSelectors(3, 0))).toEqual([OPCODES.OpTrue]);
    expect(Array.from(branchSelectors(3, 1))).toEqual([OPCODES.OpTrue, OPCODES.OpFalse]);
    expect(Array.from(branchSelectors(3, 2))).toEqual([OPCODES.OpFalse, OPCODES.OpFalse]);
  });
});

describe('composed satisfier reproduces the golden kinds byte-for-byte', () => {
  const eq = (node, plan, kind, branch) =>
    expect(bytesToHex(buildComposedSatisfier(node, plan))).toBe(want(kind, branch));

  it('htlc claim / refund', () => {
    eq(HTLC, { take: 0, child: { sig: SIG_A, preimage: PRE } }, 'htlc', 'claim');
    eq(HTLC, { take: 1, child: { sig: SIG_A } }, 'htlc', 'refund');
  });

  it('channel close (AND reversal: p2 then p1) / refund', () => {
    eq(CHANNEL, { take: 0, child: { children: [{ sig: SIG_A }, { sig: SIG_B }] } }, 'channel', 'close');
    eq(CHANNEL, { take: 1, child: { sig: SIG_A } }, 'channel', 'refund');
  });

  it('deadman owner / heir', () => {
    eq(DEADMAN, { take: 0, child: { sig: SIG_A } }, 'deadman', 'claim');
    eq(DEADMAN, { take: 1, child: { sig: SIG_A } }, 'deadman', 'refund');
  });

  it('multisig 2-of-2 (leaf, member order)', () => {
    eq(MULTISIG, { sigs: [SIG_A, SIG_B] }, 'multisig', 'claim');
  });

  it('binary_oracle_select revealA / revealB / refund (3-way ladder)', () => {
    eq(BOS, { take: 0, child: { sig: SIG_A, preimage: PRE } }, 'binary_oracle_select', 'revealA');
    eq(BOS, { take: 1, child: { sig: SIG_B, preimage: PRE } }, 'binary_oracle_select', 'revealB');
    eq(BOS, { take: 2, child: { sig: SIG_REFUND } }, 'binary_oracle_select', 'refund');
  });
});
