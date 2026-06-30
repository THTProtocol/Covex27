// gamePot.js
//
// Client-side driver for the NON-CUSTODIAL games money path ("winner takes all").
//
// The pot is a real on-chain covenant. This module never holds a key and never asks the
// server to: it drives the same prepare -> sign-in-browser -> submit pattern that the
// non-custodial covenant deploy uses (see pages/EnforcedDeploy.jsx). The funder's / winner's
// BIP340 signature is produced HERE with the in-browser private key (an imported / dev-mode
// wallet) and only the signature bytes ever leave the browser.
//
// Honesty: the POT path is an oracle_escrow [resolver, player1, player2], where the first pubkey
// slot is the deployer-bound resolver (the counterparty or an external resolver the deployer
// binds), NOT Covex. The result is computed deterministically by replaying the signed move log
// (anyone can recompute); that resolver co-signs the payout to the engine-verified winner
// (game_pot_outcome, which fails closed). That is a co-signed release, not trustless: the
// resolver is in the payout path, and the escrow has no refund branch, so a permanently-lost
// resolver key would freeze the pot. The trustless alternative is the 2-of-2 state channel (lock-channel /
// settle-channel), which keeps Covex out of the redeem entirely; its cooperative close needs
// both players to co-sign and is wired separately.

import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';

const api = (covenantId, path) =>
  `/api/games/${encodeURIComponent(covenantId)}/${path}`;

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// BIP340 sign a hex sighash with the in-browser private key. The key never leaves the device.
function signSighash(sighash, privKeyHex) {
  return bytesToHex(schnorr.sign(sighash, privKeyHex));
}

// A lock funding tx may pull together N of the funder's UTXOs, so prepare returns one input
// per UTXO, each with its OWN sighash (same outputs, different outpoint). The SAME in-browser
// key signs them all. Mirrors EnforcedDeploy.buildDeploySignatures exactly.
function buildSignatures(inputs, privKeyHex) {
  return inputs.map((inp) => ({
    index: inp.index,
    signature_hex: signSighash(inp.sighash, privKeyHex),
  }));
}

// Guard: confirm the connected in-browser key is the signer the server expects. Signing with
// the wrong wallet would just fail on-chain, but failing fast here is clearer and cheaper.
function assertSigner(prep, privKeyHex) {
  if (!prep.signer_xonly) return;
  const mine = bytesToHex(schnorr.getPublicKey(privKeyHex)).toLowerCase().replace(/^0x/, '');
  const want = String(prep.signer_xonly).toLowerCase().replace(/^0x/, '');
  if (mine !== want) {
    throw new Error(
      'The connected key does not match the address the server expects for this seat. Reconnect the wallet that owns this seat.',
    );
  }
}

// Build the /submit body for a prepared tx: signatures[] for a multi-input funding tx,
// otherwise the single signature_hex. Always carries the seat token for authorisation.
function submitBody(prep, privKeyHex, token) {
  const inputs = Array.isArray(prep.inputs) ? prep.inputs : [];
  const base = { token, session_id: prep.session_id };
  return inputs.length
    ? { ...base, signatures: buildSignatures(inputs, privKeyHex) }
    : { ...base, signature_hex: signSighash(prep.sighash, privKeyHex) };
}

/**
 * LOCK the pot (oracle_escrow). The funder is player1; only a seated player (valid token)
 * may lock. Returns the broadcast result: { success, deploy_tx_id, locked_kas, ... }.
 */
export async function lockPot({ covenantId, token, stakeKas, network, privKeyHex }) {
  if (!privKeyHex) throw new Error('Locking the pot needs an in-browser key wallet (import or dev-connect a key).');
  const prep = await postJson(api(covenantId, 'lock-pot'), { token, stake_kas: stakeKas, network });
  if (!prep.success) throw new Error(prep.error || 'Could not prepare the pot lock.');
  assertSigner(prep, privKeyHex);
  const sub = await postJson(api(covenantId, 'submit-pot'), submitBody(prep, privKeyHex, token));
  if (!sub.success) throw new Error(sub.error || 'Could not broadcast the pot lock.');
  return sub;
}

/**
 * SETTLE the pot to the server-verified winner. The caller must be the winner (their wallet
 * signs the winner half; the server contributes ONLY the oracle half over a sighash that
 * commits the single output paying the re-derived winner). Returns { success, ...payout tx }.
 */
export async function settlePot({ covenantId, token, privKeyHex }) {
  if (!privKeyHex) throw new Error('Claiming the pot needs an in-browser key wallet (import or dev-connect a key).');
  const prep = await postJson(api(covenantId, 'settle-pot'), { token });
  if (!prep.success) throw new Error(prep.error || 'Could not prepare the winner payout.');
  assertSigner(prep, privKeyHex);
  const sub = await postJson(api(covenantId, 'submit-settle'), submitBody(prep, privKeyHex, token));
  if (!sub.success) throw new Error(sub.error || 'Could not broadcast the winner payout.');
  return sub;
}

// The shared /covenant/p2sh/submit-signed endpoint: it assembles the wallet signature (and, for
// a hashlock / binary_oracle_select reveal, the revealed preimage) into the satisfier and
// broadcasts. The server never holds a key here; it only relays the signed tx.
async function submitSigned(body) {
  return postJson('/api/covenant/p2sh/submit-signed', body);
}

/**
 * ONE-CLICK WINNER CLAIM for a HASHLOCK pot (DEORACLE path). Zero Covex/referee signatures: the
 * referee only REVEALS the winning outcome's secret, and the WINNER releases the pot with their
 * OWN key. The flow, with a status callback so the UI can narrate each step honestly:
 *
 *   1. (proving)   if the server requires a zkVM game proof, supply the receipt the caller
 *                  fetched/holds. The browser cannot PRODUCE a RISC0 proof (proving is heavy and
 *                  runs off-device); it only forwards a receipt when one is available. With no
 *                  receipt the server settles on its authoritative engine replay (server check).
 *   2. (revealing) POST settle-pot-hashlock: the server re-derives the winner from its engine
 *                  replay (fail-closed) AND, when a receipt is supplied + a verifier is
 *                  provisioned, cryptographically verifies it and binds it to this match. On
 *                  success the referee reveals the winner's secret (preimage_hex) and returns the
 *                  UNSIGNED winner-branch spend (sighash + session_id). The server signs nothing.
 *   3. (signing)   the WINNER signs that sighash (BIP340) with their in-browser key.
 *   4. (broadcast) POST /covenant/p2sh/submit-signed with {session_id, signature_hex, preimage_hex};
 *                  the satisfier reveals the secret + the winner's signature on-chain. OpBlake2b +
 *                  the winner's OpCheckSig in the inscribed covenant let ONLY the winner spend.
 *
 * A loser cannot reach step 2: the server gate (and, when enforced, the ZK gate) will not reveal
 * their secret, so settle-pot-hashlock returns an error and no preimage ever leaves the server.
 *
 * @param receiptB64 optional base64 RISC0 receipt the caller obtained from the hosted prover; the
 *        browser does not generate it. Forwarded verbatim when present.
 */
export async function settlePotHashlock({ covenantId, token, privKeyHex, receiptB64, onStatus }) {
  if (!privKeyHex) throw new Error('Claiming the pot needs an in-browser key wallet (import or dev-connect a key).');
  const step = (s) => { try { onStatus?.(s); } catch { /* status is best-effort */ } };

  if (receiptB64) step('proving');
  step('revealing');
  const body = { token };
  if (receiptB64) body.receipt_b64 = receiptB64;
  const prep = await postJson(api(covenantId, 'settle-pot-hashlock'), body);
  if (!prep.success) {
    // Honest, specific surfacing. A loser (or anyone who is not the verified winner) lands here:
    // the server never revealed a secret, so there is nothing to sign.
    throw new Error(prep.error || 'The referee did not release a secret for this match. Only the verified winner can claim.');
  }
  assertSigner(prep, privKeyHex);
  if (!prep.preimage_hex) throw new Error('The settle response did not include the revealed secret; cannot complete the claim.');

  step('signing');
  const signature_hex = signSighash(prep.sighash, privKeyHex);

  step('broadcast');
  const sub = await submitSigned({
    session_id: prep.session_id,
    signature_hex,
    preimage_hex: prep.preimage_hex,
  });
  if (!sub.success) throw new Error(sub.error || 'Could not broadcast the winner payout.');
  step('paid');
  // Surface zk gate disclosure + outcome alongside the broadcast result so the UI can be honest
  // about whether a cryptographic proof backed this reveal or only the server replay did.
  return { ...sub, zk_gate: prep.zk_gate, zk_verified: prep.zk_verified, winner_addr: prep.winner_addr };
}

/**
 * REFUND a HASHLOCK pot to the FUNDER (player1) via the CSV refund branch, once the pot UTXO has
 * aged the lock window (so a silent referee cannot strand the stake). Zero Covex signatures: the
 * funder spends the refund branch with their OWN key. The node enforces the age window at
 * broadcast, so an early attempt is rejected by the node (a sequence-lock error), not by Covex.
 */
export async function refundPotHashlock({ covenantId, token, privKeyHex, onStatus }) {
  if (!privKeyHex) throw new Error('Reclaiming the pot needs an in-browser key wallet (import or dev-connect a key).');
  const step = (s) => { try { onStatus?.(s); } catch { /* status is best-effort */ } };
  step('revealing');
  const prep = await postJson(api(covenantId, 'refund-pot-hashlock'), { token });
  if (!prep.success) throw new Error(prep.error || 'Could not prepare the refund.');
  assertSigner(prep, privKeyHex);
  step('signing');
  const signature_hex = signSighash(prep.sighash, privKeyHex);
  step('broadcast');
  const sub = await submitSigned({ session_id: prep.session_id, signature_hex });
  if (!sub.success) {
    // The most common honest failure: the CSV window has not elapsed yet, so the node rejects the
    // sequence-locked input. Surface that plainly rather than as a generic error.
    throw new Error(sub.error || 'The node rejected the refund (the pot may not have aged the timelock window yet). Try again after the refund window.');
  }
  step('paid');
  return sub;
}

// ---------------------------------------------------------------------------
// ON-CHAIN ZK settlement (KIP-16 OpZkPrecompile, tag 0x20) - GATED, NOT the default.
//
// In this mode the winner PROVES the win and the CHAIN verifies it. The settlement
// covenant runs OpZkPrecompile (opcode 0xa6) on a RISC0->Groth16 proof whose journal
// binds { covenant_id, winner_pubkey, ... }; consensus (not Covex, not a referee)
// verifies the Groth16 proof, so a loser cannot forge a winning proof and no Covex key
// is in any path. See docs/ZK_ONCHAIN_PLAN.md + docs/zk_precompile_abi.md.
//
// HONESTY: this is NOT live yet. It is gated behind a build flag AND a per-pot
// settle_mode, awaiting the real game seal (Stage 2 Groth16 receipt) + a TN12 e2e
// (Stage 4). Treat it as "on-chain ZK verified (rolling out)", never as the shipped
// default. The hashlock path above stays the default.
//
// The proof itself is produced OFF-DEVICE (a RISC0->Groth16 wrap needs x86_64 + Docker,
// not the browser and not the 7GB server). The browser only fetches the finished proof
// + journal, assembles the winner-branch spend witness, signs the sighash in-wallet, and
// submits. Nothing about the proof is trusted on faith: the chain re-verifies it.

/**
 * Is the on-chain ZK games path enabled in THIS build? Default off. Flip with the Vite env
 * `VITE_ZK_ONCHAIN_GAMES=1` (build-time). Even when on, a given pot only uses it when its
 * server-side `settle_mode === 'zk_game_settle'`. Both gates must hold; this keeps the live
 * default (referee hashlock) untouched.
 */
export function zkOnchainGamesEnabled() {
  try {
    const v = import.meta?.env?.VITE_ZK_ONCHAIN_GAMES;
    return v === '1' || v === 'true' || v === true;
  } catch {
    return false;
  }
}

/** True when THIS pot settles on-chain via ZK (server field). Independent of the build flag. */
export function isZkGameSettle(game) {
  return !!game && game.settle_mode === 'zk_game_settle';
}

/**
 * Fetch the game's finished RISC0->Groth16 proof + binding journal from the server. The proof
 * is generated off-device; this call only RETRIEVES it. Response shape:
 *
 *   { proof_hex, public_inputs: [Fr0..Fr4] (5 x 32-byte LE hex), winner_pubkey (x-only hex),
 *     covenant_id, vk_hex?, sighash?, session_id? }
 *
 * Posts to `/games/:id/settle-zk` (backend/src/games.rs registers it; the handler is fail-closed:
 * only a seated player may settle, and it returns success:false rather than signing blind). The
 * field shape is frozen by docs/zk_precompile_abi.md (tag 0x20: VK, proof, n_inputs, 5x 32-byte LE
 * Fr public inputs).
 *
 * @returns {Promise<object>} the settlement bundle, or throws with an honest message.
 */
export async function fetchZkSettlement({ covenantId, token }) {
  const prep = await postJson(api(covenantId, 'settle-zk'), { token });
  if (!prep || !prep.success) {
    throw new Error(
      prep?.error ||
        'On-chain ZK settlement is not available for this pot yet. This path is rolling out and not enabled here.',
    );
  }
  if (!prep.proof_hex || !Array.isArray(prep.public_inputs) || !prep.winner_pubkey) {
    throw new Error('The settle-zk response is missing the proof, public inputs, or winner pubkey.');
  }
  return prep;
}

/**
 * ONE-CLICK WINNER CLAIM for an ON-CHAIN ZK pot (KIP-16). The WINNER proves the win and the
 * CHAIN verifies it: no referee reveal, no Covex co-signature. Status callback narrates:
 *
 *   1. (proving)   obtain the off-device RISC0->Groth16 proof + journal bound to THIS covenant_id
 *                  (the browser does not produce it; fetchZkSettlement retrieves the finished proof).
 *   2. (building)  assemble the winner-branch spend witness (VK + proof + public inputs feed the
 *                  covenant's OpZkPrecompile; the server returns the unsigned sighash + session_id).
 *   3. (signing)   the WINNER signs that sighash (BIP340) with their in-browser key.
 *   4. (broadcast) submit [signature, proof, public inputs]; the node runs OpZkPrecompile (0xa6),
 *                  verifies the Groth16 proof on-chain, then the winner-branch OpCheckSig pays out.
 *   5. (paid)      done.
 *
 * A loser cannot reach a payout: an illegal/unfinished game yields no valid proof, the journal
 * binds the winner identity + covenant_id, and consensus rejects a forged or wrong-pot proof.
 *
 * GATED: both `zkOnchainGamesEnabled()` (build flag) and `isZkGameSettle(game)` (per-pot) must
 * hold before the UI offers this; this function additionally fails closed if the flag is off.
 *
 * @returns {Promise<object>} the broadcast result ({ spend_tx_id | tx_id, ... }) plus { onchain_zk:true }.
 */
export async function settlePotZkOnchain({ covenantId, token, privKeyHex, onStatus }) {
  if (!zkOnchainGamesEnabled()) {
    throw new Error('On-chain ZK settlement is not enabled in this build (rolling out).');
  }
  if (!privKeyHex) throw new Error('Claiming the pot needs an in-browser key wallet (import or dev-connect a key).');
  const step = (s) => { try { onStatus?.(s); } catch { /* status is best-effort */ } };

  // 1. Fetch the off-device proof + binding journal (and the unsigned spend material).
  step('proving');
  const bundle = await fetchZkSettlement({ covenantId, token });

  // 2. Build the winner-branch witness. The server returns the unsigned sighash + session_id for
  //    the winner-branch spend; the proof/public inputs are carried through to the satisfier so the
  //    covenant's OpZkPrecompile can re-verify them on-chain.
  step('building');
  assertSigner(bundle, privKeyHex);
  if (!bundle.sighash || !bundle.session_id) {
    throw new Error('The settle-zk response did not include the unsigned spend sighash to sign.');
  }

  // 3. The winner signs the spend sighash in-browser; the key never leaves the device.
  step('signing');
  const signature_hex = signSighash(bundle.sighash, privKeyHex);

  // 4. Submit [signature, proof] for the winner-branch satisfier. The node verifies the Groth16
  //    proof via OpZkPrecompile (0xa6) before the winner's OpCheckSig releases the pot. The 5 public
  //    inputs are BAKED in the lock script (not witness-supplied), so submit carries only the proof.
  step('broadcast');
  const sub = await submitSigned({
    session_id: bundle.session_id,
    signature_hex,
    proof_hex: bundle.proof_hex,
  });
  if (!sub.success) throw new Error(sub.error || 'Could not broadcast the on-chain ZK payout.');
  step('paid');
  return { ...sub, onchain_zk: true, winner_pubkey: bundle.winner_pubkey };
}

// Derive the on-chain pot state for the UI from a live game object (server fields) plus the
// viewer's address. Pure; no network. Drives GamePotPanel's state machine.
//   phase: 'unavailable' | 'lockable' | 'locked' | 'claimable' | 'settling-other' | 'frozen'
//          | 'refundable' | 'paid'
//   mode:  'zk_game_settle' (KIP-16, winner proves on-chain; GATED, rolling out)
//          | 'hashlock' (de-oracle, winner spends with their OWN key; the live default)
//          | 'oracle_escrow' (legacy Covex co-sign).
//          Reads game.settle_mode; new pots default to hashlock server-side.
export function potState(game, viewerAddress) {
  if (!game) return { phase: 'unavailable' };
  const p1 = game.player1 || '';
  const p2 = game.player2 || '';
  const bothSeated = !!p1 && !!p2;
  const isFunder = !!viewerAddress && viewerAddress === p1;
  const locked = !!game.pot_tx;
  const paid = !!game.pot_payout_tx;
  const finished = game.status === 'finished';
  // Settlement path of the LOCKED pot. Only meaningful once locked. A hashlock pot has a CSV
  // refund branch (the funder can reclaim a stranded stake); a legacy oracle_escrow pot does not;
  // a zk_game_settle pot is the GATED on-chain ZK path (winner proves on-chain, rolling out).
  const mode = game.settle_mode === 'oracle_escrow'
    ? 'oracle_escrow'
    : (game.settle_mode === 'zk_game_settle' ? 'zk_game_settle' : 'hashlock');
  const winnerSide = (game.winner || '').toLowerCase();
  const winnerAddr = winnerSide === 'white' || winnerSide === 'player1' || game.winner === p1
    ? p1
    : (winnerSide === 'black' || winnerSide === 'player2' || game.winner === p2 ? p2 : '');
  const isWinner = !!viewerAddress && !!winnerAddr && viewerAddress === winnerAddr;
  const base = { mode, potKas: game.pot_amount_kas };

  if (paid) return { ...base, phase: 'paid', winnerAddr, payoutTx: game.pot_payout_tx };
  if (locked) {
    if (finished && isWinner) return { ...base, phase: 'claimable', winnerAddr, potTx: game.pot_tx };
    if (finished && winnerAddr) return { ...base, phase: 'settling-other', winnerAddr, potTx: game.pot_tx };
    // Finished but NO verified winner (a draw, or the result could not be resolved). A hashlock
    // OR a zk_game_settle pot lets the FUNDER reclaim via the CSV refund branch once it ages; show
    // that to the funder. A legacy oracle_escrow pot has no refund branch, so the stake is stuck
    // (surfaced honestly).
    if (finished) {
      const hasRefundBranch = mode === 'hashlock' || mode === 'zk_game_settle';
      if (hasRefundBranch && isFunder) return { ...base, phase: 'refundable', potTx: game.pot_tx };
      return { ...base, phase: 'frozen', potTx: game.pot_tx };
    }
    return { ...base, phase: 'locked', potTx: game.pot_tx };
  }
  // Not locked yet. Only the funder (player1), with both seats filled and the game not over,
  // can lock the real pot. (A finished, never-locked game was a free/practice match.)
  if (bothSeated && !finished && isFunder) return { ...base, phase: 'lockable' };
  return { phase: 'unavailable', mode, potKas: game.pot_amount_kas, reason: !bothSeated ? 'waiting for an opponent' : (finished ? 'no pot was locked for this match' : 'only the match creator locks the pot') };
}
