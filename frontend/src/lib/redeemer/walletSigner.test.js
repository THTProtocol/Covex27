// walletSigner.test.js
//
// Unit tests for the WALLET-EXTENSION covenant signer (walletSigner.js). These cover the
// PURE, wasm-free parts of the money path:
//   - signature extraction from a wallet's signed tx / PSKT, in the { index, signature_hex }
//     shape /submit-deploy and /submit-signed expect;
//   - byte-parity with the shared cross-language golden fixture
//     (tests/fixtures/satisfier_golden.json): the 64-byte BIP340 signature a wallet returns,
//     once extracted, MUST match the same golden placeholder the dev-key path frames via push65.
//     This is the same byte the buildSatisfier golden test pins, so a drift on either side fails.
//   - fail-closed rejections (unparseable blob, unsigned input, malformed push, wrong length);
//   - deploy fails closed with an honest reason.
//
// Like covenantRedeemer.test.js, this imports ONLY the pure helpers (no '@onekeyfe/kaspa-wasm'),
// so `npm test` never loads the ~15MB wasm. verifyWalletSignedSpend / buildWalletSpendPayload /
// signWithKasware / signWithKastle are wasm-backed and are exercised at the seam (capability +
// honest-error behavior) without driving a real wallet popup, which is owner-gated e2e.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  normalizeSig64,
  extractLeadingSig64,
  parseSignedInputs,
  extractWalletSignatures,
  signDeployWithWallet,
  COVEX_TO_KASWARE_NETWORK,
  COVEX_TO_KASTLE_NETWORK,
  normalizeNetworkId,
} from './walletSigner.js';
import { push65, pushData, bytesToHex, hexToBytes, buildSatisfier } from './covenantRedeemer.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// frontend/src/lib/redeemer -> repo root is five levels up (mirrors the golden test).
const FIXTURE = resolve(HERE, '..', '..', '..', '..', 'tests', 'fixtures', 'satisfier_golden.json');
const golden = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const SIG_A_HEX = golden.fixed_inputs.sig_a; // 64-byte placeholder "11"*64
const SIG_A = hexToBytes(SIG_A_HEX);

// Build a fake "signed input" object (kaspa-wasm ITransactionInput shape) whose signatureScript
// is the given hex - so we can drive the extractor exactly like a real wallet result.
function signedTxWithInput0Script(scriptHex) {
  return { inputs: [{ signatureScript: scriptHex }] };
}

describe('normalizeSig64', () => {
  it('unwraps a 66-byte push-framed signature [0x41 || sig64 || 0x01]', () => {
    const framed = push65(SIG_A); // 0x41 || sig || 0x01
    expect(framed.length).toBe(66);
    expect(bytesToHex(normalizeSig64(framed))).toBe(SIG_A_HEX);
  });

  it('drops the trailing sighash byte of a 65-byte (sig || type) form', () => {
    const sig65 = new Uint8Array(65);
    sig65.set(SIG_A, 0);
    sig65[64] = 0x01;
    expect(bytesToHex(normalizeSig64(sig65))).toBe(SIG_A_HEX);
  });

  it('accepts a bare 64-byte signature unchanged', () => {
    expect(bytesToHex(normalizeSig64(SIG_A))).toBe(SIG_A_HEX);
  });

  it('rejects a wrong-length blob (fail-closed)', () => {
    expect(() => normalizeSig64(new Uint8Array(33))).toThrow();
  });
});

describe('extractLeadingSig64 byte-parity with the golden push65 framing', () => {
  it('recovers the exact 64-byte BIP340 signature the dev-key path frames via push65', () => {
    // push65(SIG_A) is the leading push of a singlesig satisfier; extracting it must yield SIG_A.
    const leading = push65(SIG_A);
    expect(bytesToHex(extractLeadingSig64(leading))).toBe(SIG_A_HEX);
  });

  it('extracts the signature from a full singlesig satisfier (push65 only)', () => {
    // The singlesig golden satisfier IS push65(sig_a): the extractor reads its leading push.
    const sat = buildSatisfier({ kind: 'singlesig', sig65: SIG_A });
    expect(bytesToHex(sat)).toBe(golden.vectors.find((v) => v.kind === 'singlesig').expected_satisfier_hex);
    expect(bytesToHex(extractLeadingSig64(sat))).toBe(SIG_A_HEX);
  });

  it('extracts the leading signature from a hashlock satisfier (push65 then preimage push)', () => {
    // hashlock satisfier = push65(sig) || pushData(preimage); the LEADING push is the signature,
    // so extraction recovers sig_a and ignores the trailing preimage push.
    const pre = hexToBytes(golden.fixed_inputs.preimage);
    const sat = buildSatisfier({ kind: 'hashlock', sig65: SIG_A, preimageBytes: pre });
    expect(bytesToHex(extractLeadingSig64(sat))).toBe(SIG_A_HEX);
  });

  it('handles an OpPushData1-framed push (76..255 bytes path) for a long leading push', () => {
    // Not a real signature length, but exercises the 0x4c length-prefix branch deterministically.
    const data = new Uint8Array(80).fill(0xcd);
    const pushed = pushData(data); // [0x4c, 80, ...80 bytes]
    expect(pushed[0]).toBe(0x4c);
    expect(() => extractLeadingSig64(pushed)).toThrow(/64-byte/); // 80 != 64 -> fail-closed
  });

  it('rejects an empty signatureScript (wallet did not sign)', () => {
    expect(() => extractLeadingSig64(new Uint8Array(0))).toThrow(/empty/i);
  });

  it('rejects a push that runs past the end of the script', () => {
    // OpData32 claims 32 data bytes but only 3 follow.
    expect(() => extractLeadingSig64(Uint8Array.from([0x20, 0x01, 0x02, 0x03]))).toThrow(/past the end/i);
  });

  it('rejects a non-push leading opcode', () => {
    // 0xac (OpCheckSig) is not a data push.
    expect(() => extractLeadingSig64(Uint8Array.from([0xac, 0x00]))).toThrow(/leading opcode/i);
  });
});

describe('parseSignedInputs', () => {
  it('parses a JSON string (KasWare signPskt returns a PSKT JSON string)', () => {
    const json = JSON.stringify(signedTxWithInput0Script(bytesToHex(push65(SIG_A))));
    const inputs = parseSignedInputs(json);
    expect(Array.isArray(inputs)).toBe(true);
    expect(inputs.length).toBe(1);
  });

  it('parses an object with .transaction nesting', () => {
    const obj = { transaction: signedTxWithInput0Script(bytesToHex(push65(SIG_A))) };
    expect(parseSignedInputs(obj).length).toBe(1);
  });

  it('throws on a non-JSON string (fail-closed)', () => {
    expect(() => parseSignedInputs('not json at all {')).toThrow(/non-JSON/i);
  });

  it('throws when there is no inputs array', () => {
    expect(() => parseSignedInputs({ foo: 'bar' })).toThrow(/no inputs/i);
  });
});

describe('extractWalletSignatures (the { index, signature_hex } shape submit-* expects)', () => {
  it('extracts input 0 in the exact submit shape, byte-equal to the golden placeholder', () => {
    const signed = signedTxWithInput0Script(bytesToHex(push65(SIG_A)));
    const out = extractWalletSignatures(signed, [0]);
    expect(out).toEqual([{ index: 0, signature_hex: SIG_A_HEX }]);
  });

  it('accepts the snake_case signature_script field shape', () => {
    const signed = { inputs: [{ signature_script: bytesToHex(push65(SIG_A)) }] };
    expect(extractWalletSignatures(signed, [0])[0].signature_hex).toBe(SIG_A_HEX);
  });

  it('accepts a raw byte-array signatureScript', () => {
    const signed = { inputs: [{ signatureScript: Array.from(push65(SIG_A)) }] };
    expect(extractWalletSignatures(signed, [0])[0].signature_hex).toBe(SIG_A_HEX);
  });

  it('FAILS CLOSED on an unsigned input (empty signatureScript)', () => {
    const signed = { inputs: [{ signatureScript: '' }] };
    expect(() => extractWalletSignatures(signed, [0])).toThrow(/did not produce a signature|recovery key/i);
  });

  it('FAILS CLOSED when a requested input index is missing', () => {
    const signed = signedTxWithInput0Script(bytesToHex(push65(SIG_A)));
    expect(() => extractWalletSignatures(signed, [1])).toThrow(/missing input 1/i);
  });

  it('extracts multiple inputs in order', () => {
    const SIG_B = hexToBytes(golden.fixed_inputs.sig_b);
    const signed = {
      inputs: [
        { signatureScript: bytesToHex(push65(SIG_A)) },
        { signatureScript: bytesToHex(push65(SIG_B)) },
      ],
    };
    const out = extractWalletSignatures(signed, [0, 1]);
    expect(out[0].signature_hex).toBe(SIG_A_HEX);
    expect(out[1].signature_hex).toBe(golden.fixed_inputs.sig_b);
  });
});

describe('network maps', () => {
  it('maps Covex networks to KasWare network strings', () => {
    expect(COVEX_TO_KASWARE_NETWORK['mainnet']).toBe('kaspa_mainnet');
    expect(COVEX_TO_KASWARE_NETWORK['testnet-12']).toBe('kaspa_testnet_12');
    expect(COVEX_TO_KASWARE_NETWORK['testnet-10']).toBe('kaspa_testnet_10');
  });

  it('Kastle supports mainnet + TN10 only (no TN12)', () => {
    expect(COVEX_TO_KASTLE_NETWORK['mainnet']).toBe('mainnet');
    expect(COVEX_TO_KASTLE_NETWORK['testnet-10']).toBe('testnet-10');
    expect(COVEX_TO_KASTLE_NETWORK['testnet-12']).toBeUndefined();
  });

  it('normalizeNetworkId folds mainnet-1 to mainnet', () => {
    expect(normalizeNetworkId('mainnet-1')).toBe('mainnet');
    expect(normalizeNetworkId('testnet-12')).toBe('testnet-12');
  });
});

describe('signDeployWithWallet (fail-closed)', () => {
  it('throws an honest reason when prepare-deploy returned no deploy_plan', async () => {
    // No deploy_plan (e.g. an old backend): must fail closed, never return a partial signature.
    await expect(signDeployWithWallet({}, { signer_xonly: 'ab'.repeat(32) }, {})).rejects.toThrow(
      /deploy_plan|wallet-signable funding transaction/i,
    );
  });

  it('throws when a deploy_plan is present but the wallet exposes no signPskt/signTx', async () => {
    // deploy_plan present + a provider with neither signing method: rebuild succeeds, but the
    // wallet cannot sign, so it fails closed (steering to the in-browser key path). A minimal
    // single-input plan is enough to exercise the rebuild -> no-signing-method path.
    const plan = {
      version: 0,
      lock_time: 0,
      gas: 0,
      payload_hex: 'aa20' + '11'.repeat(32) + 'ac',
      inputs: [
        {
          transaction_id: '00'.repeat(32),
          index: 0,
          amount_sompi: 100000000,
          prev_script_public_key_hex: '0000' + '20' + 'ab'.repeat(32) + 'ac',
          sig_op_count: 1,
        },
      ],
      outputs: [
        { value_sompi: 90000000, script_public_key_hex: '0000aa20' + 'cd'.repeat(32) + '87' },
      ],
    };
    await expect(
      signDeployWithWallet({}, { signer_xonly: 'ab'.repeat(32), deploy_plan: plan }, {}),
    ).rejects.toThrow(/does not expose signPskt or signTx/i);
  });
});
