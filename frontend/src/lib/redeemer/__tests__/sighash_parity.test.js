// sighash_parity.test.js
//
// CROSS-STACK SIGHASH PARITY GATE (browser kaspa-wasm vs backend Rust).
//
// The backend pins a canonical covenant-spend sighash in
//   tests/fixtures/sighash_vector.json   (golden d4eeaa04...)
// asserted by the Rust test `sighash_vector_matches_committed_golden` in
// backend/src/covenant_builder.rs over the vendored kaspa-consensus-core
// `calc_schnorr_signature_hash` (the rule the mainnet Toccata node enforces).
//
// This test reconstructs the EXACT same fixed spend in the BROWSER stack using
// @onekeyfe/kaspa-wasm (the same library the live covenant redeemer signs with,
// frontend/src/lib/redeemer/covenantRedeemer.js -> signInput ->
// createInputSignature) and checks the sighash the wasm actually commits.
//
// RESULT: the two stacks DIVERGE on this fixed spend (this is the case the task
// anticipated). The fixture deliberately uses a NON-empty native-subnetwork
// payload ("covex-p2sh-spend") that docs/SIGHASH_PARITY.md predicted both stacks
// would agree on. They do NOT, because the divergence is BROADER than the
// "native + EMPTY payload" case that doc describes:
//
//   - Backend (vendored kaspa-consensus-core, Toccata HF): for a native tx the
//     payload is committed in every input's sighash as
//     payload_hash = blake2b(write_var_bytes(payload)).
//   - Browser (@onekeyfe/kaspa-wasm 1.0.2, a PRE-Toccata rusty-kaspa build):
//     for a native-subnetwork tx it uses payload_hash = ZERO_HASH and never
//     commits the payload bytes at all - even when the payload is non-empty.
//
// So the SAME tx hashes to two different sighashes:
//   backend / consensus golden : d4eeaa044dfa960a72dae4d51d4e4e69a7a5a9d93ff4238b11c9f1620a3121b3
//   browser kaspa-wasm value   : 68e350d5074f3531b153103f3d445d83fca969061f503685fd45e2b44739463b
// The single differing term is payload_hash (everything else - tx version, the
// prev-outputs/sequences/sig-op-count sub-hashes, the input outpoint, the P2SH
// input scriptPublicKey, amount, the outputs sub-hash, lock_time, subnetwork id,
// gas, and the SIG_HASH_ALL byte - is byte-identical between the two stacks; this
// test proves that by isolating the payload term below).
//
// PER docs/SIGHASH_PARITY.md this divergence is a FUND-PATH item: aligning the two
// stacks (e.g. bumping the wasm to a Toccata build, or making both sides agree on
// the payload rule) changes which signatures the consensus node accepts and MUST be
// proven with a real testnet-12 end-to-end spend, NOT merged on unit tests alone.
// This file therefore DOCUMENTS reality (asserts the ACTUAL browser value and
// records the golden it differs from) rather than hiding it; it must NOT be "fixed"
// by forcing equality. Each stack is internally self-consistent today (the side
// that builds a tx also signs it), so production spends are node-valid; the two are
// only NON-INTEROPERABLE, which is exactly what this gate freezes in place.
//
// HOW the sighash is checked without a sighash-returning wasm export:
// the redeemer's real path is createInputSignature() (it returns a Schnorr
// signature, not the digest). The backend signs the sighash as a BIP340 message
// directly (kaspa-consensus-core/src/sign.rs: Message::from_digest_slice(sig_hash)
// -> sign_schnorr). So a candidate 32-byte sighash H is the message the wasm signed
// iff schnorr.verify(sig, H, xonlyPub) is true. We sign with a throwaway key (the
// sighash is key-INDEPENDENT) and verify the wasm signature against the candidates
// with @noble/curves. The recovered browser value is additionally cross-checked by
// an independent JS reimplementation of calc_schnorr_signature_hash built on the
// wasm's own keyed-blake2b hasher (TransactionSigningHash), which is proven correct
// against the vendored consensus golden vector before being applied to the fixture.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Import the explicit bindgen entry: @onekeyfe/kaspa-wasm 1.0.2 ships only a
// `module` field (no `main`/`exports`), which the browser build resolves but the
// vitest (SSR) resolver does not - the bare specifier fails to resolve under tests.
import * as kaspa from '@onekeyfe/kaspa-wasm/kaspa.js';
import { initSync } from '@onekeyfe/kaspa-wasm/kaspa.js';
import { schnorr } from '@noble/curves/secp256k1';
import { blake2b } from '@noble/hashes/blake2b';

// ---- the two canonical sighash values for the fixed fixture spend ----
const GOLDEN_BACKEND = 'd4eeaa044dfa960a72dae4d51d4e4e69a7a5a9d93ff4238b11c9f1620a3121b3';
const BROWSER_WASM = '68e350d5074f3531b153103f3d445d83fca969061f503685fd45e2b44739463b';

// ---- tiny encoders mirroring kaspa-consensus-core HasherExtensions ----
const hexToBytes = (h) => {
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
  return b;
};
const bytesToHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const u16le = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
const u32le = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
const u64le = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
const concat = (...arr) => {
  let len = 0; for (const a of arr) len += a.length;
  const out = new Uint8Array(len); let o = 0;
  for (const a of arr) { out.set(a, o); o += a.length; }
  return out;
};
// write_var_bytes: u64-LE length prefix then raw bytes.
const varBytes = (bytes) => concat(u64le(bytes.length), bytes);

// kaspa's `TransactionSigningHash` is blake2b-256 keyed with b"TransactionSigningHash"
// (asserted explicitly below against the wasm's own hasher).
const TSH_KEY = new TextEncoder().encode('TransactionSigningHash');
const tsh = (msg) => blake2b(msg, { dkLen: 32, key: TSH_KEY });

// Independent JS port of calc_schnorr_signature_hash for ONE native-subnetwork
// input/output spend (SIG_HASH_ALL == 1). `payloadHash` is injected so we can
// exercise the two competing payload rules. Field order/encoding mirrors
// backend/vendor/kaspa-consensus-core/src/hashing/sighash.rs exactly.
function calcSighashSingle({ txid, inputIndex, sequence, sigOpCount, inSpkVersion, inSpkScript, amount, outValue, outScriptVersion, outScript, lockTime, gas, payloadHash }) {
  const prevOutputsHash = tsh(concat(hexToBytes(txid), u32le(inputIndex)));
  const sequencesHash = tsh(u64le(sequence));
  const sigOpCountsHash = tsh(new Uint8Array([sigOpCount]));
  const outputsHash = tsh(concat(u64le(outValue), u16le(outScriptVersion), varBytes(outScript)));
  return bytesToHex(tsh(concat(
    u16le(0),                                       // tx.version (u16 LE)
    prevOutputsHash, sequencesHash, sigOpCountsHash,
    hexToBytes(txid), u32le(inputIndex),            // hash_outpoint
    u16le(inSpkVersion), varBytes(inSpkScript),     // hash_script_public_key (input spk)
    u64le(amount), u64le(sequence), new Uint8Array([sigOpCount]),
    outputsHash,
    u64le(lockTime),
    new Uint8Array(20),                             // native subnetwork id (all-zero)
    u64le(gas),
    payloadHash,
    new Uint8Array([1]),                            // SIG_HASH_ALL.to_u8()
  )));
}

let fixture;
beforeAll(() => {
  // Init the wasm from the on-disk .wasm.bin bytes (vitest runs under Node; there is
  // no browser fetch). initSync accepts the raw module bytes and compiles them.
  const wasmPath = fileURLToPath(new URL('../../../../node_modules/@onekeyfe/kaspa-wasm/kaspa_bg.wasm.bin', import.meta.url));
  initSync({ module: new Uint8Array(readFileSync(wasmPath)) });
  // Fixture lives at repo-root tests/fixtures (shared with the Rust golden test).
  const fxPath = fileURLToPath(new URL('../../../../../tests/fixtures/sighash_vector.json', import.meta.url));
  fixture = JSON.parse(readFileSync(fxPath, 'utf8'));
});

// Reconstruct the EXACT fixture spend as a kaspa-wasm Transaction (same shape the
// redeemer's buildUnsignedSpend produces, but with the fixture's pinned raw output
// script + the backend non-empty payload marker so it matches the Rust golden tx).
function buildFixtureTx(k, s) {
  const { Transaction, payToScriptHashScript } = k;
  const p2sh = payToScriptHashScript(hexToBytes(s.redeem_hex)); // input spk = P2SH(redeem)
  const outpoint = { transactionId: s.input_txid, index: s.input_index >>> 0 };
  return new Transaction({
    version: 0,
    inputs: [{
      previousOutpoint: outpoint,
      signatureScript: new Uint8Array(0),
      sequence: BigInt(s.input_sequence),
      sigOpCount: s.input_sig_op_count,
      utxo: {
        outpoint,
        address: undefined,
        amount: BigInt(s.utxo_amount),
        scriptPublicKey: p2sh,
        blockDaaScore: BigInt(s.utxo_block_daa_score),
        isCoinbase: false,
      },
    }],
    outputs: [{
      value: BigInt(s.output_value),
      scriptPublicKey: { version: s.output_script_version, script: s.output_script_hex },
    }],
    lockTime: BigInt(s.lock_time),
    subnetworkId: new Uint8Array(20),         // native
    gas: BigInt(s.gas),
    payload: s.payload_hex,                    // NON-empty "covex-p2sh-spend"
  });
}

// Sign input 0 of `tx` with the wasm (the redeemer's real createInputSignature path)
// and return the bare 64-byte BIP340 signature, unwrapping the 66-byte push-ready
// framing [OpData65(0x41)] [64 sig] [SIG_HASH_ALL(0x01)] exactly as signInput does.
function wasmSign64(k, tx, privKeyHex) {
  const raw = k.createInputSignature(tx, 0, new k.PrivateKey(privKeyHex), k.SighashType.All);
  let sig = typeof raw === 'string' ? hexToBytes(raw) : new Uint8Array(raw);
  if (sig.length === 66 && sig[0] === 0x41 && sig[65] === 0x01) sig = sig.slice(1, 65);
  else if (sig.length === 65) sig = sig.slice(0, 64);
  if (sig.length !== 64) throw new Error(`unexpected wasm signature length ${sig.length}`);
  return sig;
}

describe('cross-stack sighash parity (browser kaspa-wasm vs backend Rust golden)', () => {
  // A throwaway browser-held key; the sighash is independent of the signing key, so
  // any valid key recovers the same message under schnorr.verify.
  const PRIV = '11'.repeat(32);

  it('the wasm hasher is blake2b-256 keyed with "TransactionSigningHash" (same as the consensus crate)', () => {
    const empty = new kaspa.TransactionSigningHash().finalize();
    expect(empty).toBe(bytesToHex(tsh(new Uint8Array(0))));
  });

  it('the JS sighash reimplementation matches the vendored consensus golden vector (native-all-0)', () => {
    // Vendored test vector from kaspa-consensus-core/src/hashing/sighash.rs
    // (3 inputs, 2 outputs, native, empty payload). The official Toccata rule for a
    // native+EMPTY payload is payload_hash = ZERO_HASH; this proves our field layout.
    const txid = '880eb9819a31821d9d2399e2f35e2433b72637e393d71ecc9b8d0250f49153c3';
    const spk1 = '208325613d2eeaf7176ac6c670b13c0043156c427438ed72d74b7800862ad884e8ac';
    const spk2 = '20fcef4c106cf11135bbd70f02a726a92162d2fb8b22f0469126f800862ad884e8ac';
    // multi-input sub-hashes, computed inline (the helper above is single-input).
    const prevOutputsHash = tsh(concat(
      hexToBytes(txid), u32le(0), hexToBytes(txid), u32le(1), hexToBytes(txid), u32le(2),
    ));
    const sequencesHash = tsh(concat(u64le(0), u64le(1), u64le(2)));
    const sigOpCountsHash = tsh(concat(new Uint8Array([0]), new Uint8Array([0]), new Uint8Array([0])));
    const outputsHash = tsh(concat(
      u64le(300), u16le(0), varBytes(hexToBytes(spk2)),
      u64le(300), u16le(0), varBytes(hexToBytes(spk1)),
    ));
    const ZERO_HASH = new Uint8Array(32);
    const got = bytesToHex(tsh(concat(
      u16le(0), prevOutputsHash, sequencesHash, sigOpCountsHash,
      hexToBytes(txid), u32le(0),             // input 0 outpoint
      u16le(0), varBytes(hexToBytes(spk1)),   // utxo[0] spk
      u64le(100), u64le(0), new Uint8Array([0]),
      outputsHash,
      u64le(1615462089000),
      new Uint8Array(20), u64le(0),
      ZERO_HASH,                              // native + empty -> ZERO_HASH (official)
      new Uint8Array([1]),
    )));
    expect(got).toBe('03b7ac6927b2b67100734c3cc313ff8c2e8b3ce3e746d46dd660b706a916b1f5');
  });

  it('reconstructs the fixture tx and the wasm/browser sighash is byte-identical to the recovered BROWSER_WASM value', () => {
    const s = fixture.spend;
    expect(fixture.expected_sighash_hex).toBe(GOLDEN_BACKEND); // fixture pins the backend golden

    // The wasm input scriptPublicKey is the consensus P2SH wrapper of the redeem; our
    // JS reimplementation must use the SAME spk bytes, so read them from the wasm.
    const p2sh = kaspa.payToScriptHashScript(hexToBytes(s.redeem_hex));
    const pj = p2sh.toJSON ? p2sh.toJSON() : p2sh;
    const inSpkScript = hexToBytes(pj.script);
    const inSpkVersion = pj.version;

    // Browser sighash = same layout as the backend, EXCEPT payload_hash = ZERO_HASH
    // (the pre-Toccata native rule the @onekeyfe/kaspa-wasm 1.0.2 build implements).
    const browserComputed = calcSighashSingle({
      txid: s.input_txid, inputIndex: s.input_index, sequence: s.input_sequence,
      sigOpCount: s.input_sig_op_count, inSpkVersion, inSpkScript,
      amount: s.utxo_amount, outValue: s.output_value,
      outScriptVersion: s.output_script_version, outScript: hexToBytes(s.output_script_hex),
      lockTime: s.lock_time, gas: s.gas,
      payloadHash: new Uint8Array(32), // ZERO_HASH (browser native rule)
    });
    expect(browserComputed).toBe(BROWSER_WASM);

    // And the wasm's own createInputSignature signs exactly this value: verify the
    // wasm signature against BROWSER_WASM as the BIP340 message. This is the GATE -
    // it pins what the browser stack actually commits for the fixed money-path spend.
    const tx = buildFixtureTx(kaspa, s);
    const sig = wasmSign64(kaspa, tx, PRIV);
    const xonly = schnorr.getPublicKey(PRIV);
    expect(schnorr.verify(sig, hexToBytes(BROWSER_WASM), xonly)).toBe(true);
  });

  it('the backend golden differs from the browser value ONLY in the payload_hash term (everything else is byte-identical)', () => {
    const s = fixture.spend;
    const p2sh = kaspa.payToScriptHashScript(hexToBytes(s.redeem_hex));
    const pj = p2sh.toJSON ? p2sh.toJSON() : p2sh;
    const common = {
      txid: s.input_txid, inputIndex: s.input_index, sequence: s.input_sequence,
      sigOpCount: s.input_sig_op_count, inSpkVersion: pj.version, inSpkScript: hexToBytes(pj.script),
      amount: s.utxo_amount, outValue: s.output_value,
      outScriptVersion: s.output_script_version, outScript: hexToBytes(s.output_script_hex),
      lockTime: s.lock_time, gas: s.gas,
    };
    // Backend (Toccata): payload committed via blake2b(write_var_bytes(payload)).
    const backendComputed = calcSighashSingle({
      ...common,
      payloadHash: tsh(varBytes(hexToBytes(s.payload_hex))),
    });
    // Browser (pre-Toccata native): payload_hash = ZERO_HASH.
    const browserComputed = calcSighashSingle({ ...common, payloadHash: new Uint8Array(32) });

    expect(backendComputed).toBe(GOLDEN_BACKEND);
    expect(browserComputed).toBe(BROWSER_WASM);
    expect(backendComputed).not.toBe(browserComputed);
  });

  it('XFAIL-style: the wasm signature does NOT verify against the backend golden (documents the FUND-PATH divergence, see docs/SIGHASH_PARITY.md)', () => {
    // If this assertion ever FLIPS to true, the two stacks have ALIGNED on the same
    // sighash. That is a fund-path change: it MUST be confirmed by a real testnet-12
    // end-to-end spend (deploy a covenant, spend it through the changed stack, confirm
    // the node consumes the UTXO) and the constants/comments above updated to match -
    // it must NOT be left as a silently passing test. See docs/SIGHASH_PARITY.md
    // "Alignment is a fund-path change".
    const s = fixture.spend;
    const tx = buildFixtureTx(kaspa, s);
    const sig = wasmSign64(kaspa, tx, PRIV);
    const xonly = schnorr.getPublicKey(PRIV);
    expect(schnorr.verify(sig, hexToBytes(GOLDEN_BACKEND), xonly)).toBe(false);
  });
});
