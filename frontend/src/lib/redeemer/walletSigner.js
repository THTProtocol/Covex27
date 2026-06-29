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

// Reduce any pubkey hex to its lowercase 32-byte (64-hex) x-only form for matching. A wallet may
// key a PSKT partialSigs map (or label a partial-sig entry) by EITHER the 33-byte compressed
// pubkey (02/03 || x, 66 hex) or the bare 32-byte x-only key (64 hex). We strip a 0x prefix, drop
// a leading 02/03 compression byte when present (66 -> 64 hex), and lowercase, so a 33-byte map key
// and the 32-byte signer_xonly from prepare-spend/-deploy compare equal. Returns null for anything
// that is not a 64- or 66-hex pubkey, so a malformed key never spuriously matches.
function normalizeXonlyHex(s) {
  if (typeof s !== 'string') return null;
  let h = s.trim().replace(/^0x/i, '').toLowerCase();
  if (h.length === 66 && (h.startsWith('02') || h.startsWith('03'))) h = h.slice(2);
  return h.length === 64 && /^[0-9a-f]{64}$/.test(h) ? h : null;
}

// Coerce a per-input partial signature value (the bytes a wallet recorded for one signer) to a
// Uint8Array, accepting the hex-string / array / Uint8Array shapes wallets use. Returns null when
// the value is absent or unparseable so the caller fails closed rather than guessing.
function partialSigBytes(val) {
  if (val == null) return null;
  if (val instanceof Uint8Array) return val.length ? val : null;
  if (Array.isArray(val)) return val.length ? Uint8Array.from(val) : null;
  if (typeof val === 'string') {
    const h = val.replace(/^0x/i, '');
    if (!h) return null;
    return hexToBytes(h);
  }
  // Some wallets nest the bytes under a field (e.g. { signature: '...' } / { sig: [...] }).
  if (typeof val === 'object') {
    return partialSigBytes(val.signature ?? val.sig ?? val.signatureHex ?? val.sig_hex ?? null);
  }
  return null;
}

// Pull the 64-byte BIP340 signature for a SPECIFIC signer out of a PSKT input's partial-signature
// container. A real KasWare / OKX signPskt does NOT finalize the input into a signatureScript; the
// signature it produced lives in a per-input partialSigs map under the signer's pubkey. We handle
// BOTH shapes seen across wallets/versions:
//   1. an OBJECT map:  { "<pubkeyHex>": "<sigHex>", ... }   (xonly OR 33-byte compressed key)
//   2. an ARRAY:       [{ pubkey|pubKey|publicKey, signature|sig }, ...]
// We select the entry whose pubkey matches the EXPECTED signer x-only (normalized so a 33-byte
// compressed map key matches the 32-byte signer_xonly) and return its raw signature bytes. When no
// expected signer is supplied (e.g. a deploy that signs every input with the SAME deployer key) we
// accept the sole entry. Returns null when there is no partial-sig container or no matching entry,
// so extraction falls through to the finalized-sigScript path or fails closed.
//
// @param {object} inp                 - one parsed PSKT input
// @param {string|null} expectedXonly  - the signer's normalized x-only hex (or null to take the sole entry)
// @returns {Uint8Array|null} the raw signature bytes for that signer (pre-normalizeSig64), or null
function partialSigForSigner(inp, expectedXonly) {
  if (!inp || typeof inp !== 'object') return null;
  const container = inp.partialSigs ?? inp.partial_sigs ?? null;
  if (container == null) return null;
  const want = expectedXonly ? normalizeXonlyHex(expectedXonly) : null;

  // Shape 1: object map pubkeyHex -> sigHex.
  if (!Array.isArray(container) && typeof container === 'object' && !(container instanceof Uint8Array)) {
    const entries = Object.entries(container);
    if (entries.length === 0) return null;
    if (want) {
      for (const [k, v] of entries) {
        if (normalizeXonlyHex(k) === want) return partialSigBytes(v);
      }
      return null; // expected signer's partial sig absent -> fail closed upstream.
    }
    // No expected signer named: accept the single partial sig (multi-entry is ambiguous -> null).
    return entries.length === 1 ? partialSigBytes(entries[0][1]) : null;
  }

  // Shape 2: array of { pubkey, signature } records.
  if (Array.isArray(container)) {
    if (container.length === 0) return null;
    const keyOf = (e) => e && (e.pubkey ?? e.pubKey ?? e.publicKey ?? e.public_key ?? e.xonly ?? e.x_only ?? null);
    const sigOf = (e) => e && (e.signature ?? e.sig ?? e.signatureHex ?? e.sig_hex ?? null);
    if (want) {
      for (const e of container) {
        if (normalizeXonlyHex(keyOf(e)) === want) return partialSigBytes(sigOf(e));
      }
      return null;
    }
    return container.length === 1 ? partialSigBytes(sigOf(container[0])) : null;
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
// TWO extraction paths, tried in order, so this works on REAL wallets (not only synthetic
// finalized fixtures):
//   1. partialSigs: a real KasWare / OKX signPskt returns a PSKT whose produced signature lives in
//      a per-input partialSigs map (or array) keyed by the signer's pubkey, NOT a finalized
//      signatureScript. We select the entry matching `expectedSignerXonly` (when given) and
//      normalize it to 64 bytes. This is the PRIMARY path for the wallet money flow.
//   2. finalized signatureScript: kept as a FALLBACK for wallets / fixtures that hand back an
//      already-finalized input (the leading push is the signature).
// If both are absent for a requested input the wallet did not sign it -> fail closed.
//
// @param {string|object} signed              - the wallet's signed tx / PSKT (JSON string or object)
// @param {number[]} indices                  - input indices to extract (e.g. [0] for a spend)
// @param {string} [expectedSignerXonly]      - the signer's x-only hex (prepare-spend/-deploy
//        signer_xonly); selects the right partialSigs entry. Omit it (or pass falsy) to accept a
//        sole partial-sig entry, the right behavior for a deploy where one key signs every input.
// @returns {{ index: number, signature_hex: string }[]}
export function extractWalletSignatures(signed, indices, expectedSignerXonly) {
  const inputs = parseSignedInputs(signed);
  const out = [];
  for (const index of indices) {
    const inp = inputs[index];
    if (!inp) throw new Error(`wallet signed transaction is missing input ${index}`);
    // (1) PRIMARY: the per-input partial signature for THIS signer (real signPskt output).
    let sig64;
    const partial = partialSigForSigner(inp, expectedSignerXonly);
    if (partial) {
      sig64 = normalizeSig64(partial);
    } else {
      // (2) FALLBACK: an already-finalized signatureScript (the leading push is the signature).
      const sigScript = inputSigScriptBytes(inp);
      if (!sigScript) {
        throw new Error(`wallet did not produce a signature for input ${index} (use the recovery key tool)`);
      }
      sig64 = extractLeadingSig64(sigScript);
    }
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
  // Pass the covenant signer's x-only so a real signPskt's partialSigs map is read for the RIGHT
  // key. verifyWalletSignedSpend below re-checks the extracted sig against that same key fail-closed.
  const extracted = extractWalletSignatures(signed, [0], opts.signerXonly);
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
  const extracted = extractWalletSignatures(signed, [0], opts.signerXonly);
  const { signature_hex } = extracted[0];
  await verifyWalletSignedSpend(plan, signature_hex, opts);
  return { signatures: extracted };
}

// ── Deploy (funding-tx) signing ──────────────────────────────────────────────
// The deploy funding tx spends the deployer's OWN standard-address UTXOs into the covenant P2SH
// output (plus an optional change output back to the deployer), carrying the aa20+blake2b(redeem)
// +redeem deploy payload. prepare-deploy now returns a `deploy_plan` with every byte the browser
// needs to rebuild THIS exact unsigned funding tx (the same tx the server computed the per-input
// sighashes over), so a wallet (KasWare signPskt / Kastle signTx) can sign each input and the
// extracted signatures match the server's sighashes byte for byte. submit-deploy re-verifies each
// signature against the SAME stored unsigned tx, so a wallet that signs the wrong tx fails closed
// at submit; here we ALSO fail closed by re-deriving each input's sighash locally and verifying
// the wallet's extracted signature against the deployer's own x-only key before returning.

// Turn a server `script_public_key_hex` (version_u16 big-endian || script) into a wasm
// ScriptPublicKey. The server serializes SPKs exactly as ScriptPublicKey::from_bytes parses them
// (u16 BE version prefix), so rebuilding here is byte-identical to the on-chain spk.
function spkFromHex(ScriptPublicKey, spkHex) {
  const bytes = hexToBytes(spkHex);
  if (bytes.length < 2) throw new Error('deploy_plan: scriptPublicKey hex is too short');
  const version = (bytes[0] << 8) | bytes[1]; // big-endian u16
  const script = bytes.slice(2);
  return new ScriptPublicKey(version, script);
}

// Rebuild the EXACT unsigned funding Transaction from a deploy_plan. Mirrors buildUnsignedSpend but
// for the multi-input + payload + change-output funding shape. Each input carries its prev utxo
// (amount + spk) so the wasm can compute the per-input sighash; the outputs + payload are taken
// verbatim from the plan so the rebuilt tx is value-identical to the server's.
export async function buildUnsignedDeploy(plan) {
  if (!plan || !Array.isArray(plan.inputs) || plan.inputs.length === 0) {
    throw new Error('buildUnsignedDeploy: deploy_plan.inputs is required');
  }
  if (!Array.isArray(plan.outputs) || plan.outputs.length === 0) {
    throw new Error('buildUnsignedDeploy: deploy_plan.outputs is required');
  }
  const k = await loadWasmDeploy();
  const { Transaction, ScriptPublicKey } = k;
  const inputs = plan.inputs.map((inp) => {
    if (!inp || inp.transaction_id === undefined || inp.index === undefined || inp.amount_sompi === undefined) {
      throw new Error('buildUnsignedDeploy: each input needs {transaction_id, index, amount_sompi}');
    }
    const outpoint = { transactionId: inp.transaction_id, index: inp.index >>> 0 };
    return {
      previousOutpoint: outpoint,
      signatureScript: new Uint8Array(0),
      sequence: 0n,
      sigOpCount: Number(inp.sig_op_count ?? 1),
      utxo: {
        outpoint,
        address: undefined,
        amount: BigInt(inp.amount_sompi),
        scriptPublicKey: spkFromHex(ScriptPublicKey, inp.prev_script_public_key_hex),
        blockDaaScore: 0n,
        isCoinbase: false,
      },
    };
  });
  const outputs = plan.outputs.map((o) => ({
    value: BigInt(o.value_sompi),
    scriptPublicKey: spkFromHex(ScriptPublicKey, o.script_public_key_hex),
  }));
  const payload = plan.payload_hex ? hexToBytes(plan.payload_hex) : new Uint8Array(0);
  return new Transaction({
    version: Number(plan.version ?? 0),
    inputs,
    outputs,
    lockTime: BigInt(plan.lock_time ?? 0),
    subnetworkId: new Uint8Array(20),
    gas: BigInt(plan.gas ?? 0),
    payload,
  });
}

// Lazy wasm import (kept local so the pure helpers above stay wasm-free for CI).
async function loadWasmDeploy() {
  return import('@onekeyfe/kaspa-wasm');
}

// Verify the wallet's extracted signature for funding input `idx` validates against the deployer's
// own x-only key over the rebuilt tx's input-`idx` sighash. Fail-closed: if the wallet signed a
// different tx (wrong outputs/payload) the signature will not verify and we refuse it.
async function verifyDeployInputSig(tx, idx, signatureHex, signerXonlyHex) {
  const k = await loadWasmDeploy();
  const { verifyInputSignature, SighashType } = k;
  if (typeof verifyInputSignature !== 'function') {
    throw new Error('cannot verify the wallet deploy signature in this build (verifyInputSignature unavailable); use the in-browser key path');
  }
  const sig = normalizeSig64(hexToBytes(signatureHex));
  const sighashAll = SighashType ? SighashType.All : undefined;
  let ok;
  try {
    ok = verifyInputSignature(tx, idx, sig, hexToBytes(signerXonlyHex), sighashAll);
  } catch (e) {
    throw new Error(`wallet deploy signature verification threw for input ${idx} (${e && e.message ? e.message : e}); refusing to submit`, { cause: e });
  }
  if (!ok) {
    throw new Error(`wallet deploy signature for input ${idx} does not verify against the funding tx; the wallet could not sign this deploy. Use the in-browser key path.`);
  }
  return true;
}

// Sign a covenant DEPLOY (funding tx) with a connected wallet. Rebuilds the funding tx from
// prep.deploy_plan, hands it to the wallet (signing ALL inputs, since every input is the deployer's
// own P2PK), extracts the per-input 64-byte signatures, re-verifies each against the deployer's
// x-only key, and returns the { signatures: [{index, signature_hex}] } shape /submit-deploy expects.
// Throws an honest error (steering to the in-browser key path) if deploy_plan is absent or the
// wallet cannot sign; never returns a partial/unsafe signature.
//
// @param {object} provider - the connected wallet provider (window.kasware / window.kastle / OKX)
// @param {object} prep     - the prepare-deploy response (must include deploy_plan, signer_xonly)
// @param {object} opts     - { networkId, walletNetworkId? }
// @returns {Promise<{ signatures: {index:number, signature_hex:string}[] }>}
export async function signDeployWithWallet(provider, prep, opts = {}) {
  const plan = prep && prep.deploy_plan;
  if (!plan) {
    throw new Error(
      'Wallet-extension deploy signing is unavailable: the deploy prepare step did not return a wallet-signable funding transaction (deploy_plan). Fund this deploy with the in-browser key path. (Wallet-signed REDEEM is fully supported.)',
    );
  }
  const signerXonly = prep.signer_xonly;
  if (!signerXonly) throw new Error('prepare-deploy did not return signer_xonly; cannot verify the wallet deploy signature');
  // Capability check FIRST (before any wasm rebuild): fail fast + keep the no-wallet path wasm-free.
  const hasPskt = !!(provider && typeof provider.signPskt === 'function');
  const hasSignTx = !!(provider && typeof provider.signTx === 'function');
  if (!hasPskt && !hasSignTx) {
    throw new Error('This wallet does not expose signPskt or signTx and cannot sign a covenant deploy. Use the in-browser key path.');
  }
  const tx = await buildUnsignedDeploy(plan);
  const indices = plan.inputs.map((_, i) => i);

  let txJson;
  try {
    if (typeof tx.serializeToSafeJSON === 'function') txJson = tx.serializeToSafeJSON();
    else if (typeof tx.toJSON === 'function') txJson = JSON.stringify(tx.toJSON());
    else txJson = JSON.stringify(tx);
  } catch {
    txJson = JSON.stringify(tx);
  }

  const SIG_HASH_ALL_TYPE = 1; // SighashType::All
  let signed;
  if (hasPskt) {
    // KasWare family (also OKX): sign EVERY input with SIG_HASH_ALL.
    try {
      signed = await provider.signPskt({
        txJsonString: txJson,
        options: { signInputs: indices.map((index) => ({ index, sighashType: SIG_HASH_ALL_TYPE })) },
      });
    } catch (e) {
      throw new Error(`The wallet could not sign this covenant deploy (${e && e.message ? e.message : e}). Use the in-browser key path.`, { cause: e });
    }
  } else if (hasSignTx) {
    // Kastle: the deploy inputs are standard P2PK (the deployer's own address), so no custom
    // `scripts` entry is needed; Kastle signs them like an ordinary send.
    const walletNet = opts.walletNetworkId;
    if (!walletNet) {
      throw new Error('Kastle cannot sign a deploy on this network. Use mainnet or testnet-10, or the in-browser key path.');
    }
    try {
      signed = await provider.signTx(walletNet, txJson);
    } catch (e) {
      throw new Error(`The wallet could not sign this covenant deploy (${e && e.message ? e.message : e}). Use the in-browser key path.`, { cause: e });
    }
  }

  // Every funding input is the deployer's OWN P2PK, signed by the SAME key, so pass signerXonly to
  // read the right partialSigs entry on a real signPskt (and fall back to a finalized sigScript).
  const extracted = extractWalletSignatures(signed, indices, signerXonly);
  // Fail-closed: every funding input must verify against the deployer's own key over the rebuilt tx.
  for (const { index, signature_hex } of extracted) {
    await verifyDeployInputSig(tx, index, signature_hex, signerXonly);
  }
  return { signatures: extracted };
}
