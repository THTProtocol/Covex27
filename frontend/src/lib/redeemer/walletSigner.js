// walletSigner.js
//
// WALLET-EXTENSION covenant signing (the PRIMARY money path that replaces the raw
// private-key paste). Produces the SAME { index, signature_hex } shape that
// /covenant/p2sh/submit-deploy and /covenant/p2sh/submit-signed expect, but the
// 64-byte BIP340 Schnorr signatures come from a connected wallet popup (KasWare /
// Kastle / OKX) instead of an in-browser key.
//
// THREE strategies live behind one façade (see WalletContext.signCovenantSpend /
// signCovenantDeploy, which dispatch on the connected wallet id):
//
//   1. dev-key  -> the existing @noble schnorr / verifyAndSignSpend path (kept as a
//                  third strategy + the offline recovery fallback). NOT in this file;
//                  WalletContext keeps calling covenantRedeemer directly for it.
//   2. kasware  -> signWithKasware (also OKX, window.okxwallet.kaspa, KasWare-compatible)
//   3. kastle   -> signWithKastle
//
// FAIL-CLOSED DISCIPLINE (money path): every wallet path
//   (a) rebuilds the EXACT unsigned spend tx Covex already builds (buildUnsignedSpend),
//       so the output is the user's own destination paying input - fee BY CONSTRUCTION;
//   (b) hands the wallet that tx (KasWare signPskt with the covenant redeem script as the
//       input spk; Kastle signTx with the redeem script in `scripts`);
//   (c) EXTRACTS the per-input 64-byte BIP340 signature from what the wallet returns;
//   (d) re-VERIFIES (verifyWalletSignedSpend) that the signature validates against the
//       LOCAL output-checked tx's input-0 sighash before returning it. If the wallet
//       errored, returned an unparseable blob, or the signature does not verify, we throw
//       a clear honest error ("This wallet could not sign this covenant spend; use the
//       recovery key tool"). We NEVER blind-submit whatever the wallet returns, and we
//       NEVER silently fall back to something unsafe.
//
// HONESTY: whether a given wallet's signPskt / signTx accepts a CUSTOM P2SH covenant input
// (vs a standard address UTXO) is not proven on every wallet/version. That is exactly why
// step (d) exists: a wallet that cannot do it fails the verification and the user is steered
// to the recovery-key tool. The UI labels wallet covenant-signing as the PRIMARY path with
// the recovery-key tool as the backup, and does NOT claim it is proven.

import {
  buildUnsignedSpend,
  sigOpCount,
  bytesToHex,
  hexToBytes,
} from './covenantRedeemer.js';

// ── Network mapping (Covex id -> wallet network string) ──────────────────────
// KasWare getNetwork() returns kaspa_mainnet / kaspa_testnet_10 / kaspa_testnet_11 /
// kaspa_testnet_12; Kastle uses a NetworkId string (mainnet / testnet-10). These maps are
// the single source of truth shared with WalletContext (re-exported there).
export const COVEX_TO_KASWARE_NETWORK = Object.freeze({
  mainnet: 'kaspa_mainnet',
  'mainnet-1': 'kaspa_mainnet',
  'testnet-10': 'kaspa_testnet_10',
  'testnet-11': 'kaspa_testnet_11',
  'testnet-12': 'kaspa_testnet_12',
});

export const COVEX_TO_KASTLE_NETWORK = Object.freeze({
  mainnet: 'mainnet',
  'mainnet-1': 'mainnet',
  'testnet-10': 'testnet-10',
  // Kastle supports mainnet + TN10 ONLY (no TN12); intentionally omitted so the capability
  // check below reports it honestly rather than guessing a wallet-network string.
});

// Normalize getCurrentNetwork()'s possible 'mainnet-1' to what buildUnsignedSpend accepts.
export function normalizeNetworkId(net) {
  return net === 'mainnet-1' ? 'mainnet' : net;
}

// ── Pure helpers (unit-testable; no wasm, no wallet) ─────────────────────────

// Strip a 66-byte push-framed signature [0x41, ...sig64, 0x01] or a 65-byte
// [...sig64, sighashtype] down to the bare 64-byte BIP340 signature. Mirrors the
// normalization in covenantRedeemer.signInput so an extracted wallet signature is in the
// SAME canonical form the dev-key path returns (the form push65() re-frames).
export function normalizeSig64(bytes) {
  let sig = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (sig.length === 66 && sig[0] === 0x41 && sig[65] === 0x01) {
    sig = sig.slice(1, 65);
  } else if (sig.length === 65) {
    sig = sig.slice(0, 64);
  }
  if (sig.length !== 64) {
    throw new Error(`extracted signature is ${sig.length} bytes, expected a 64-byte BIP340 signature`);
  }
  return sig;
}

// Pull the leading data push out of an input's signatureScript and normalize it to the bare
// 64-byte BIP340 signature. For a covenant satisfier the FIRST push is always the signer's
// push65 ([0x41, ...sig64, 0x01]); for a standard P2PK input the script is also a single
// push65 of the signature. We read the canonical push at offset 0 and unwrap it.
//
// @param {Uint8Array} sigScript - the input's signatureScript bytes
// @returns {Uint8Array} the bare 64-byte BIP340 signature
export function extractLeadingSig64(sigScript) {
  const s = sigScript instanceof Uint8Array ? sigScript : hexToBytes(sigScript);
  if (s.length === 0) throw new Error('input signatureScript is empty: the wallet did not sign this input');
  const op = s[0];
  let dataStart;
  let dataLen;
  if (op >= 0x01 && op <= 0x4b) {
    // OpData1..OpData75: opcode == length. push65 is 0x41 (65 bytes).
    dataLen = op;
    dataStart = 1;
  } else if (op === 0x4c) {
    // OpPushData1: 1-byte length prefix.
    dataLen = s[1];
    dataStart = 2;
  } else {
    throw new Error(`unexpected leading opcode 0x${op.toString(16)} in signatureScript (expected a canonical signature push)`);
  }
  if (dataStart + dataLen > s.length) {
    throw new Error('signatureScript push runs past the end of the script (malformed wallet output)');
  }
  const pushed = s.slice(dataStart, dataStart + dataLen);
  return normalizeSig64(pushed);
}

// Read a hex/array/Uint8Array signatureScript out of a parsed input object across the wallet
// JSON shapes we have seen: { signatureScript } (kaspa-wasm ITransactionInput), { signature_script }
// (snake), or a PSKT partial-sig field. Returns a Uint8Array, or null when none is present.
function inputSigScriptBytes(inp) {
  if (!inp || typeof inp !== 'object') return null;
  const raw =
    inp.signatureScript ??
    inp.signature_script ??
    inp.sigScript ??
    (inp.finalScriptSig || inp.final_script_sig) ??
    null;
  if (raw == null) return null;
  if (raw instanceof Uint8Array) return raw.length ? raw : null;
  if (Array.isArray(raw)) return raw.length ? Uint8Array.from(raw) : null;
  if (typeof raw === 'string') {
    const h = raw.replace(/^0x/i, '');
    if (!h) return null;
    return hexToBytes(h);
  }
  return null;
}

// Parse the INPUTS array out of a wallet's signed result, which may be:
//   - a JSON string (KasWare signPskt returns a PSKT JSON string; Kastle signTx returns tx JSON)
//   - an object with .inputs (a Transaction shape)
//   - a PSKT object with .inputs (each carrying a partial/final sig)
// Returns the inputs array, or throws if the shape is unrecognizable.
export function parseSignedInputs(signed) {
  let obj = signed;
  if (typeof signed === 'string') {
    const t = signed.trim();
    try {
      obj = JSON.parse(t);
    } catch (e) {
      throw new Error('wallet returned a non-JSON signed transaction; cannot extract the signature', { cause: e });
    }
  }
  if (!obj || typeof obj !== 'object') {
    throw new Error('wallet returned an empty or non-object signed transaction');
  }
  // Common nestings: { transaction: {...} }, { tx: {...} }, { pskt: {...} }, raw tx.
  const tx = obj.transaction || obj.tx || obj.pskt || obj;
  const inputs = tx.inputs || tx.txInputs || obj.inputs;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('wallet signed transaction has no inputs array; cannot extract the signature');
  }
  return inputs;
}

// Extract the per-input 64-byte BIP340 signatures from a wallet's signed result, for the
// given input indices. Returns [{ index, signature_hex }] in the SAME shape /submit-deploy
// and /submit-signed expect. Throws (fail-closed) if any requested input is unsigned or its
// signature cannot be normalized to 64 bytes.
//
// @param {string|object} signed - the wallet's signed tx / PSKT (JSON string or object)
// @param {number[]} indices     - input indices to extract (e.g. [0] for a spend)
// @returns {{ index: number, signature_hex: string }[]}
export function extractWalletSignatures(signed, indices) {
  const inputs = parseSignedInputs(signed);
  const out = [];
  for (const index of indices) {
    const inp = inputs[index];
    if (!inp) throw new Error(`wallet signed transaction is missing input ${index}`);
    const sigScript = inputSigScriptBytes(inp);
    if (!sigScript) {
      throw new Error(`wallet did not produce a signature for input ${index} (use the recovery key tool)`);
    }
    const sig64 = extractLeadingSig64(sigScript);
    out.push({ index, signature_hex: bytesToHex(sig64) });
  }
  return out;
}

// ── Wasm-backed verification of a wallet-extracted spend signature ───────────
// Rebuild the EXACT tx from the plan, then prove the wallet's extracted 64-byte signature
// verifies against input 0's sighash. This is the fail-closed re-verification: if the wallet
// signed a DIFFERENT tx (different output/fee/sighash) the signature will NOT verify here and
// we refuse it. Uses kaspa-wasm verifyInputSignature when available; that import is lazy so
// the pure helpers above stay wasm-free for CI.
//
// @returns {Promise<boolean>} true iff the signature is valid for input 0 of the rebuilt tx.
export async function verifyWalletSignedSpend(plan, signatureHex, opts = {}) {
  const { intendedDest, networkId } = opts;
  if (!plan || !plan.input) throw new Error('verifyWalletSignedSpend: a spend_plan with input is required');
  if (!intendedDest) throw new Error('verifyWalletSignedSpend: opts.intendedDest is required');
  if (!networkId) throw new Error('verifyWalletSignedSpend: opts.networkId is required');

  const inAmt = BigInt(plan.input.amount_sompi);
  const fee = BigInt(plan.fee_sompi);
  // Reuse the same shape-asserts verifyAndSignSpend enforces (defense in depth; buildUnsignedSpend
  // re-derives the output anyway, so the wallet cannot redirect funds).
  if (BigInt(plan.output_amount_sompi) !== inAmt - fee) {
    throw new Error('verifyWalletSignedSpend: plan output is not input - fee; refusing to verify a redirected plan');
  }
  const localOps = sigOpCount(plan.kind_base, { total: plan.total });
  if (Number(plan.sig_op_count) !== Number(localOps)) {
    throw new Error(`verifyWalletSignedSpend: sig_op_count ${plan.sig_op_count} != local ${localOps} for ${plan.kind_base}`);
  }

  const tx = await buildUnsignedSpend({
    utxo: { transactionId: plan.input.transaction_id, index: Number(plan.input.index), amount: inAmt },
    redeemHex: plan.redeem_hex,
    destAddr: intendedDest,
    networkId,
    fee,
    kind: plan.kind_base,
    branch: plan.branch || undefined,
    lockTime: plan.lock_time,
    sequence: plan.sequence,
    total: plan.total,
  });

  const sig = normalizeSig64(hexToBytes(signatureHex));
  const k = await import('@onekeyfe/kaspa-wasm');
  const { verifyInputSignature, SighashType } = k;
  if (typeof verifyInputSignature !== 'function') {
    // The installed wasm build does not expose verifyInputSignature. We cannot cryptographically
    // re-check the wallet's signature here, so FAIL CLOSED rather than trust an unverifiable sig.
    throw new Error('cannot verify the wallet signature in this build (verifyInputSignature unavailable); use the recovery key tool');
  }
  const sighashAll = SighashType ? SighashType.All : undefined;
  // signerXonly is the key the chain will OpCheckSig for input 0; the caller supplies it from
  // the prepare-spend signer_xonly so we verify against the named covenant key.
  const signerXonly = opts.signerXonly;
  if (!signerXonly) throw new Error('verifyWalletSignedSpend: opts.signerXonly is required to verify the signature');
  let ok;
  try {
    ok = verifyInputSignature(tx, 0, sig, hexToBytes(signerXonly), sighashAll);
  } catch (e) {
    throw new Error(`wallet signature verification threw (${e && e.message ? e.message : e}); refusing to submit`, { cause: e });
  }
  if (!ok) {
    throw new Error('wallet signature does not verify against the covenant spend; the wallet could not sign this covenant input. Use the recovery key tool.');
  }
  return true;
}

// ── Build the wallet-ready unsigned spend payload ────────────────────────────
// Both wallet wrappers need the SAME unsigned tx Covex builds, plus the redeem script so the
// wallet treats input 0 as a P2SH covenant input (KasWare: the input's prev spk; Kastle: the
// `scripts` array). We export the JSON the wallet consumes.
//
// @returns {Promise<{ tx: object, txJson: string, redeemHex: string }>}
export async function buildWalletSpendPayload(plan, opts = {}) {
  const { intendedDest, networkId } = opts;
  if (!plan || !plan.input) throw new Error('buildWalletSpendPayload: a spend_plan with input is required');
  if (!intendedDest) throw new Error('buildWalletSpendPayload: opts.intendedDest is required');
  if (!networkId) throw new Error('buildWalletSpendPayload: opts.networkId is required');
  const inAmt = BigInt(plan.input.amount_sompi);
  const fee = BigInt(plan.fee_sompi);
  const tx = await buildUnsignedSpend({
    utxo: { transactionId: plan.input.transaction_id, index: Number(plan.input.index), amount: inAmt },
    redeemHex: plan.redeem_hex,
    destAddr: intendedDest,
    networkId,
    fee,
    kind: plan.kind_base,
    branch: plan.branch || undefined,
    lockTime: plan.lock_time,
    sequence: plan.sequence,
    total: plan.total,
  });
  let txJson;
  try {
    if (typeof tx.serializeToSafeJSON === 'function') txJson = tx.serializeToSafeJSON();
    else if (typeof tx.toJSON === 'function') txJson = JSON.stringify(tx.toJSON());
    else txJson = JSON.stringify(tx);
  } catch {
    txJson = JSON.stringify(tx);
  }
  return { tx, txJson, redeemHex: plan.redeem_hex };
}

// ── KasWare (and OKX, KasWare-compatible) ────────────────────────────────────
// KasWare exposes signPskt({ txJsonString, options:{ signInputs:[{index, sighashType}] } })
// returning a signed PSKT JSON string. We hand it the unsigned spend tx with the covenant
// redeem script as input 0's spk, ask it to sign input 0 with SIG_HASH_ALL, extract the
// 64-byte signature, and FAIL CLOSED unless it verifies against the local output-checked tx.
//
// @param {object} provider - window.kasware (or window.okxwallet.kaspa)
// @param {object} plan     - the spend_plan from prepare-spend
// @param {object} opts     - { intendedDest, networkId, signerXonly }
// @returns {Promise<{ signatures: [{index, signature_hex}] }>}
export async function signWithKasware(provider, plan, opts = {}) {
  if (!provider || typeof provider.signPskt !== 'function') {
    throw new Error('This wallet does not expose signPskt and cannot sign a covenant spend. Use the recovery key tool.');
  }
  const { txJson } = await buildWalletSpendPayload(plan, opts);
  const SIG_HASH_ALL_TYPE = 1; // SighashType::All
  let signed;
  try {
    signed = await provider.signPskt({
      txJsonString: txJson,
      options: { signInputs: [{ index: 0, sighashType: SIG_HASH_ALL_TYPE }] },
    });
  } catch (e) {
    throw new Error(`The wallet could not sign this covenant spend (${e && e.message ? e.message : e}). This can happen when a wallet does not support custom P2SH covenant inputs. Use the recovery key tool.`, { cause: e });
  }
  const extracted = extractWalletSignatures(signed, [0]);
  const { signature_hex } = extracted[0];
  await verifyWalletSignedSpend(plan, signature_hex, opts);
  return { signatures: extracted };
}

// ── Kastle ────────────────────────────────────────────────────────────────
// Kastle exposes signTx(networkId, txJson, scripts?) returning a signed tx JSON. `scripts` is
// the documented path for non-standard / P2SH inputs: we pass the covenant redeem script so
// Kastle treats input 0 as a P2SH input it must satisfy. Same extract + fail-closed verify.
//
// @param {object} provider - window.kastle
// @param {object} plan     - the spend_plan from prepare-spend
// @param {object} opts     - { intendedDest, networkId, walletNetworkId, signerXonly }
//        walletNetworkId is the Kastle NetworkId string (mainnet / testnet-10).
// @returns {Promise<{ signatures: [{index, signature_hex}] }>}
export async function signWithKastle(provider, plan, opts = {}) {
  if (!provider || typeof provider.signTx !== 'function') {
    throw new Error('This wallet does not expose signTx and cannot sign a covenant spend. Use the recovery key tool.');
  }
  const walletNet = opts.walletNetworkId;
  if (!walletNet) {
    throw new Error('Kastle cannot sign on this network. Kastle supports mainnet and testnet-10 only (not testnet-12). Switch networks or use the recovery key tool.');
  }
  const { txJson, redeemHex } = await buildWalletSpendPayload(plan, opts);
  let signed;
  try {
    // scripts = the custom redeem scripts for non-standard / P2SH inputs (Kastle's documented
    // path). One entry for input 0's covenant redeem script.
    signed = await provider.signTx(walletNet, txJson, [{ index: 0, scriptHex: redeemHex }]);
  } catch (e) {
    throw new Error(`The wallet could not sign this covenant spend (${e && e.message ? e.message : e}). This can happen when a wallet does not support custom P2SH covenant inputs. Use the recovery key tool.`, { cause: e });
  }
  const extracted = extractWalletSignatures(signed, [0]);
  const { signature_hex } = extracted[0];
  await verifyWalletSignedSpend(plan, signature_hex, opts);
  return { signatures: extracted };
}

// ── Deploy (funding-tx) signing ──────────────────────────────────────────────
// The deploy funding tx spends the deployer's OWN standard-address UTXOs into the covenant
// P2SH output. prepare-deploy returns per-input sighashes but NOT the full unsigned funding tx
// JSON, so the browser cannot rebuild the EXACT funding tx a wallet must sign to make the
// extracted signatures match the server's sighashes. Until prepare-deploy returns a
// wallet-signable tx, the wallet-deploy path FAILS CLOSED with an honest message rather than
// risk a doomed broadcast. The dev-key (in-browser schnorr) path still funds deploys today; a
// wallet user funds via that recovery key tool or the dev key.
//
// Kept as a named export so WalletContext.signCovenantDeploy can call it and surface the honest
// reason; it never returns a partial/unsafe signature.
// eslint-disable-next-line no-unused-vars
export async function signDeployWithWallet(provider, prep, opts = {}) {
  throw new Error(
    'Wallet-extension deploy signing is not available yet: the deploy prepare step does not return a wallet-signable funding transaction, so a wallet popup cannot produce signatures that match it. Fund this deploy with the in-browser key path, or redeem an existing covenant with your wallet. (Wallet-signed REDEEM is fully supported.)',
  );
}
