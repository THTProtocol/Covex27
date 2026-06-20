// covenantRedeemer.wasm.test.js
//
// WASM-WRAPPER END-TO-END test (section B of covenantRedeemer.js). This is the regression
// gate for the kaspa-wasm 1.0.2 wrapper fixes that were verified by hand in Chrome via the
// standalone covex-claim tool (repo github.com/THTProtocol/covex-claim), then ported back to
// this in-app source of truth:
//
//   1. payToAddressScript  (addressToScriptPublicKey is NOT exported in kaspa-wasm 1.0.2)
//   2. the input's utxo ENTRY must carry its own `outpoint` field (UtxoEntryReference serde)
//   3. signInput must UNWRAP createInputSignature's 66-byte push-ready framing
//      [0x41][64-byte sig][0x01] down to the RAW 64-byte signature, so the pure-core push65()
//      can re-frame it once (double-framing -> node rejects the spend).
//
// The real @onekeyfe/kaspa-wasm is a wasm-bindgen "--target web" build that cannot load in
// node/vitest (and node_modules may not even resolve it under CI). So we vi.mock the package
// with a FAITHFUL fake of exactly the surface the wrappers touch. The mock lets the wrapper
// ORCHESTRATION logic - the precise code we ported - run end to end and be asserted:
//   - it deliberately does NOT export addressToScriptPublicKey, so a regression to that name
//     throws "payToAddressScript is not a function"-style failure and this test goes red.
//   - createInputSignature returns the real 1.0.2 66-byte framing so the unwrap is exercised.
//   - Transaction is a passthrough that captures the constructed shape (inputs/outputs/fee).
//   - payToScriptHashSignatureScript emits [satisfier || pushData(redeem)] so the final signed
//     tx carries the satisfier framing we can assert (push65 of the unwrapped 64-byte sig).
//
// The real on-chain proof (a Chrome-built, broadcast spend) lives with the standalone tool;
// this test pins the wrapper logic so the in-app path cannot silently regress the divergence.

import { describe, it, expect, vi } from 'vitest';

// ---- Faithful fake of the kaspa-wasm 1.0.2 surface the wrappers use. ----
// Module-scoped recorders the tests inspect after the wrappers run.
const calls = { payToAddressScript: [], createInputSignature: 0 };

vi.mock('@onekeyfe/kaspa-wasm', () => {
  const SIG_HASH_ALL = 0x01;
  const OP_DATA_65 = 0x41;

  // Deterministic 64-byte "signature" so the test can recognize it inside the final tx.
  const RAW_SIG_64 = new Uint8Array(64).fill(0xc5);

  // Tag spk objects so the test can tell a P2SH spk from an address spk apart.
  function payToScriptHashScript(redeemBytes) {
    return { kind: 'p2sh', version: 0, fromRedeemLen: redeemBytes.length };
  }
  // The ONLY address->spk export in 1.0.2. (addressToScriptPublicKey is intentionally absent.)
  function payToAddressScript(addr) {
    calls.payToAddressScript.push(addr);
    return { kind: 'address-spk', version: 0, addr };
  }

  class PrivateKey {
    constructor(hex) { this.hex = hex; }
    free() { this.freed = true; }
  }

  // 1.0.2 returns the 66-byte PUSH-READY framing: [0x41][64-byte sig][0x01].
  function createInputSignature(/* tx, idx, pk, sighashType */) {
    calls.createInputSignature += 1;
    const out = new Uint8Array(66);
    out[0] = OP_DATA_65;
    out.set(RAW_SIG_64, 1);
    out[65] = SIG_HASH_ALL;
    return out;
  }

  const SighashType = { All: 'all' };

  // Passthrough Transaction: keep the exact constructed shape for assertions.
  class Transaction {
    constructor(spec) { Object.assign(this, spec); }
  }

  // Mirror the Rust pay_to_script_hash_signature_script tail: emit the satisfier bytes
  // followed by a canonical data push of the redeem script. The satisfier already contains
  // the push65 framing from the pure core, so the test can locate [0x41 .. sig .. 0x01].
  function payToScriptHashSignatureScript(redeemBytes, satisfierBytes) {
    const redeemPush = redeemBytes.length <= 75
      ? Uint8Array.from([redeemBytes.length, ...redeemBytes])
      : Uint8Array.from([0x4c, redeemBytes.length & 0xff, ...redeemBytes]);
    const out = new Uint8Array(satisfierBytes.length + redeemPush.length);
    out.set(satisfierBytes, 0);
    out.set(redeemPush, satisfierBytes.length);
    return out;
  }

  return {
    Transaction,
    PrivateKey,
    SighashType,
    payToScriptHashScript,
    payToAddressScript,
    createInputSignature,
    payToScriptHashSignatureScript,
    __RAW_SIG_64: RAW_SIG_64,
  };
});

// Import AFTER vi.mock so the wrappers resolve to the fake.
import {
  buildUnsignedSpend,
  signInput,
  assembleSigScript,
  buildSatisfier,
  push65,
  pushData,
  bytesToHex,
  OPCODES,
  SIG_HASH_ALL,
} from './covenantRedeemer.js';

// A tiny but well-formed singlesig redeem: <32-byte pubkey> OpCheckSig.
const PUBKEY = new Uint8Array(32).fill(0x11);
const SINGLESIG_REDEEM = Uint8Array.from([OPCODES.OpData32, ...PUBKEY, OPCODES.OpCheckSig]);
const SINGLESIG_REDEEM_HEX = bytesToHex(SINGLESIG_REDEEM);

// A hashlock redeem: OpBlake2b <32-byte hash> OpEqualVerify <32-byte pubkey> OpCheckSig.
const HASH32 = new Uint8Array(32).fill(0x22);
const HASHLOCK_REDEEM = Uint8Array.from([
  OPCODES.OpBlake2b, OPCODES.OpData32, ...HASH32, OPCODES.OpEqualVerify,
  OPCODES.OpData32, ...PUBKEY, OPCODES.OpCheckSig,
]);
const HASHLOCK_REDEEM_HEX = bytesToHex(HASHLOCK_REDEEM);

const PRIV_HEX = 'ab'.repeat(32);
const DEST = 'kaspatest:qqexampledestaddressxxxxxxxxxxxxxxxxxxxxxxxxxx';
const UTXO = { transactionId: 'aa'.repeat(32), index: 1, amount: 100000n };
const FEE = 5000n;

describe('wasm wrappers: buildUnsignedSpend (kaspa-wasm 1.0.2 shape)', () => {
  it('builds an unsigned singlesig spend with the 1.0.2 wrapper fixes', async () => {
    calls.payToAddressScript.length = 0;
    const tx = await buildUnsignedSpend({
      utxo: UTXO, redeemHex: SINGLESIG_REDEEM_HEX, destAddr: DEST,
      networkId: 'testnet-12', fee: FEE, kind: 'singlesig',
    });

    // FIX 1: the address spk came from payToAddressScript (NOT addressToScriptPublicKey).
    expect(calls.payToAddressScript).toEqual([DEST]);
    expect(tx.outputs).toHaveLength(1);
    expect(tx.outputs[0].scriptPublicKey.kind).toBe('address-spk');

    // Output value is DERIVED as amount - fee (non-redirectable SIG_HASH_ALL output).
    expect(tx.outputs[0].value).toBe(UTXO.amount - FEE);

    // FIX 2: the input's utxo ENTRY carries its own `outpoint` (UtxoEntryReference serde).
    expect(tx.inputs).toHaveLength(1);
    const inp = tx.inputs[0];
    expect(inp.utxo.outpoint).toBeDefined();
    expect(inp.utxo.outpoint.transactionId).toBe(UTXO.transactionId);
    expect(inp.utxo.outpoint.index).toBe(1);
    // And it is the SAME outpoint object referenced by previousOutpoint (no drift).
    expect(inp.previousOutpoint).toBe(inp.utxo.outpoint);
    // The utxo entry's spk is the P2SH of the redeem (sighash commits the right script).
    expect(inp.utxo.scriptPublicKey.kind).toBe('p2sh');
    // sigOpCount for singlesig is 1 (committed in the sighash; the node enforces it).
    expect(inp.sigOpCount).toBe(1);
  });
});

describe('wasm wrappers: signInput unwraps the 66-byte framing (FIX 3)', () => {
  it('returns the RAW 64-byte signature, stripping [0x41 .. 0x01]', async () => {
    calls.createInputSignature = 0;
    const tx = await buildUnsignedSpend({
      utxo: UTXO, redeemHex: SINGLESIG_REDEEM_HEX, destAddr: DEST,
      networkId: 'testnet-12', fee: FEE, kind: 'singlesig',
    });
    const sig = await signInput(tx, 0, PRIV_HEX);

    expect(calls.createInputSignature).toBe(1);
    // The mock returns 66 push-ready bytes; signInput must hand back the bare 64-byte sig.
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(64);
    expect(sig[0]).not.toBe(OPCODES.OpData65); // leading 0x41 was stripped
    expect(Array.from(sig)).toEqual(Array.from(new Uint8Array(64).fill(0xc5)));
  });
});

describe('wasm wrappers: end-to-end singlesig claim (build -> sign -> assemble)', () => {
  it('produces a complete signed tx with the correct fee and satisfier framing', async () => {
    const tx = await buildUnsignedSpend({
      utxo: UTXO, redeemHex: SINGLESIG_REDEEM_HEX, destAddr: DEST,
      networkId: 'testnet-12', fee: FEE, kind: 'singlesig',
    });
    const sig64 = await signInput(tx, 0, PRIV_HEX);

    // The pure core re-frames the bare 64-byte sig via push65 -> [0x41 .. sig .. 0x01].
    const satisfier = buildSatisfier({ kind: 'singlesig', sig65: sig64 });
    const sigScript = await assembleSigScript(SINGLESIG_REDEEM_HEX, satisfier);

    // Wire the assembled signatureScript back onto the input (what a UI would broadcast).
    tx.inputs[0].signatureScript = sigScript;

    // The satisfier is EXACTLY push65 of the unwrapped sig (one frame, not a double frame).
    const expectedSatisfier = push65(new Uint8Array(64).fill(0xc5));
    expect(bytesToHex(satisfier)).toBe(bytesToHex(expectedSatisfier));
    // 66 bytes: 0x41 + 64 sig + 0x01. Prove we did NOT double-frame (would be 68+).
    expect(satisfier.length).toBe(66);
    expect(satisfier[0]).toBe(OPCODES.OpData65);
    expect(satisfier[65]).toBe(SIG_HASH_ALL);

    // The full signatureScript = satisfier || pushData(redeem). It starts with the push65
    // frame and ends with the canonical redeem push.
    const hex = bytesToHex(sigScript);
    expect(hex.startsWith(bytesToHex(expectedSatisfier))).toBe(true);
    expect(hex.endsWith(bytesToHex(SINGLESIG_REDEEM))).toBe(true);

    // Output integrity survived the round trip.
    expect(tx.outputs[0].value).toBe(UTXO.amount - FEE);
  });
});

describe('wasm wrappers: end-to-end hashlock claim (build -> sign -> assemble)', () => {
  it('produces a signed tx whose satisfier is push65(sig) || pushData(preimage)', async () => {
    const preimage = new Uint8Array(32).fill(0x5e);
    const tx = await buildUnsignedSpend({
      utxo: UTXO, redeemHex: HASHLOCK_REDEEM_HEX, destAddr: DEST,
      networkId: 'testnet-12', fee: FEE, kind: 'hashlock',
    });
    const sig64 = await signInput(tx, 0, PRIV_HEX);
    expect(sig64.length).toBe(64);

    const satisfier = buildSatisfier({ kind: 'hashlock', sig65: sig64, preimageBytes: preimage });
    const sigScript = await assembleSigScript(HASHLOCK_REDEEM_HEX, satisfier);
    tx.inputs[0].signatureScript = sigScript;

    // hashlock satisfier = push65(sig) then pushData(preimage). (Rust @1013-1017)
    const expected = new Uint8Array([
      ...push65(new Uint8Array(64).fill(0xc5)),
      ...pushData(preimage),
    ]);
    expect(bytesToHex(satisfier)).toBe(bytesToHex(expected));
    // First 66 bytes are the single push65 frame; byte 66 begins the preimage push (OpData32).
    expect(satisfier[0]).toBe(OPCODES.OpData65);
    expect(satisfier[65]).toBe(SIG_HASH_ALL);
    expect(satisfier[66]).toBe(OPCODES.OpData32); // 0x20: 32-byte preimage push

    const hex = bytesToHex(sigScript);
    expect(hex.endsWith(bytesToHex(HASHLOCK_REDEEM))).toBe(true);
    expect(tx.outputs[0].value).toBe(UTXO.amount - FEE);
  });
});
