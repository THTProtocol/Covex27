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

// Derive the on-chain pot state for the UI from a live game object (server fields) plus the
// viewer's address. Pure; no network. Drives GamePotPanel's state machine.
//   phase: 'unavailable' | 'lockable' | 'locked' | 'claimable' | 'settling-other' | 'frozen'
//          | 'refundable' | 'paid'
//   mode:  'hashlock' (de-oracle, winner spends with their OWN key) | 'oracle_escrow' (legacy
//          Covex co-sign). Reads game.settle_mode; new pots default to hashlock server-side.
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
  // refund branch (the funder can reclaim a stranded stake); a legacy oracle_escrow pot does not.
  const mode = game.settle_mode === 'oracle_escrow' ? 'oracle_escrow' : 'hashlock';
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
    // pot lets the FUNDER reclaim via the CSV refund branch once it ages; show that to the funder.
    // A legacy oracle_escrow pot has no refund branch, so the stake is stuck (surfaced honestly).
    if (finished) {
      if (mode === 'hashlock' && isFunder) return { ...base, phase: 'refundable', potTx: game.pot_tx };
      return { ...base, phase: 'frozen', potTx: game.pot_tx };
    }
    return { ...base, phase: 'locked', potTx: game.pot_tx };
  }
  // Not locked yet. Only the funder (player1), with both seats filled and the game not over,
  // can lock the real pot. (A finished, never-locked game was a free/practice match.)
  if (bothSeated && !finished && isFunder) return { ...base, phase: 'lockable' };
  return { phase: 'unavailable', mode, potKas: game.pot_amount_kas, reason: !bothSeated ? 'waiting for an opponent' : (finished ? 'no pot was locked for this match' : 'only the match creator locks the pot') };
}
