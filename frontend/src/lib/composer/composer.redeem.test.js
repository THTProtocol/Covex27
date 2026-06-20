// composer.redeem.test.js
//
// LOCK-side byte-parity gate. Proves composer/redeem.js reproduces the REAL Rust ScriptBuilder
// output (tests/fixtures/redeem_golden.json, captured from the live prepare-deploy) by
// composing atomic leaves: the four leaves, plus htlc as OR(hashlock, timelock) and channel
// as OR(AND(sig p1, sig p2), timelock p1). A correct add_lock_time + AND-verify-form + OR
// IF/ELSE ladder is the only way these match. Any drift = a wrong P2SH = stranded funds, so
// this fails the build.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { leaf, allOf, either } from './tree';
import { buildComposedRedeem, redeemLeaf, scriptNumberLE } from './redeem';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '..', '..', '..', '..', 'tests', 'fixtures', 'redeem_golden.json');
const g = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const fi = g.fixed_inputs;
const bytesToHex = (u8) => Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');

describe('scriptNumberLE matches the Rust add_lock_time operand', () => {
  it('5000000 -> 40 4b 4c ; 4320 -> e0 10 ; sign-pad when top bit set', () => {
    expect(bytesToHex(scriptNumberLE(5000000))).toBe('404b4c');
    expect(bytesToHex(scriptNumberLE(4320))).toBe('e010');
    expect(bytesToHex(scriptNumberLE(128))).toBe('8000'); // 0x80 high bit -> positive sign pad
  });
});

describe('redeem leaves reproduce the Rust ground truth', () => {
  it('singlesig', () => {
    expect(bytesToHex(redeemLeaf('singlesig', { pubkey: fi.xonly }, true))).toBe(g.leaves.singlesig);
  });
  it('hashlock', () => {
    expect(bytesToHex(redeemLeaf('hashlock', { hash32: fi.hash_of_ab32, pubkey: fi.xonly }, true))).toBe(g.leaves.hashlock);
  });
  it('timelock (CLTV + add_lock_time)', () => {
    expect(bytesToHex(redeemLeaf('timelock', { lock_daa: fi.lock_daa, pubkey: fi.xonly }, true))).toBe(g.leaves.timelock);
  });
  it('rcsv (CSV + add_lock_time)', () => {
    expect(bytesToHex(redeemLeaf('rcsv', { min_sequence: fi.rcsv_seq, pubkey: fi.xonly }, true))).toBe(g.leaves.rcsv);
  });
});

describe('composed redeem scripts reproduce the existing kinds byte-for-byte', () => {
  it('htlc = OR(hashlock, timelock) [IF/ELSE ladder]', () => {
    const htlc = either(
      leaf('hashlock', { hash32: fi.hash_of_ab32, pubkey: fi.xonly }),
      leaf('timelock', { lock_daa: fi.lock_daa, pubkey: fi.xonly }, 'backstop'),
    );
    expect(bytesToHex(buildComposedRedeem(htlc))).toBe(g.composites.htlc_OR_hashlock_timelock);
  });

  it('channel = OR(AND(sig p1, sig p2), timelock p1) [AND verify-form + OR]', () => {
    const channel = either(
      allOf(leaf('singlesig', { pubkey: fi.p1 }), leaf('singlesig', { pubkey: fi.p2 })),
      leaf('timelock', { lock_daa: fi.lock_daa, pubkey: fi.p1 }, 'backstop'),
    );
    expect(bytesToHex(buildComposedRedeem(channel))).toBe(g.composites.channel_OR_AND_p1p2_timelock_p1);
  });
});
