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

// Derive the on-chain pot state for the UI from a live game object (server fields) plus the
// viewer's address. Pure; no network. Drives GamePotPanel's state machine.
//   phase: 'unavailable' | 'lockable' | 'locked' | 'claimable' | 'settling-other' | 'paid'
export function potState(game, viewerAddress) {
  if (!game) return { phase: 'unavailable' };
  const p1 = game.player1 || '';
  const p2 = game.player2 || '';
  const bothSeated = !!p1 && !!p2;
  const isFunder = !!viewerAddress && viewerAddress === p1;
  const locked = !!game.pot_tx;
  const paid = !!game.pot_payout_tx;
  const finished = game.status === 'finished';
  const winnerSide = (game.winner || '').toLowerCase();
  const winnerAddr = winnerSide === 'white' || winnerSide === 'player1' || game.winner === p1
    ? p1
    : (winnerSide === 'black' || winnerSide === 'player2' || game.winner === p2 ? p2 : '');
  const isWinner = !!viewerAddress && !!winnerAddr && viewerAddress === winnerAddr;

  if (paid) return { phase: 'paid', winnerAddr, potKas: game.pot_amount_kas, payoutTx: game.pot_payout_tx };
  if (locked) {
    if (finished && isWinner) return { phase: 'claimable', winnerAddr, potKas: game.pot_amount_kas, potTx: game.pot_tx };
    if (finished && winnerAddr) return { phase: 'settling-other', winnerAddr, potKas: game.pot_amount_kas, potTx: game.pot_tx };
    // Finished but NO verified winner (a draw, or the co-signer could not resolve the result):
    // plain oracle_escrow has no refund branch, so the stake is stuck. Surface that honestly
    // instead of implying a payout that can never happen.
    if (finished) return { phase: 'frozen', potKas: game.pot_amount_kas, potTx: game.pot_tx };
    return { phase: 'locked', potKas: game.pot_amount_kas, potTx: game.pot_tx };
  }
  // Not locked yet. Only the funder (player1), with both seats filled and the game not over,
  // can lock the real pot. (A finished, never-locked game was a free/practice match.)
  if (bothSeated && !finished && isFunder) return { phase: 'lockable', potKas: game.pot_amount_kas };
  return { phase: 'unavailable', reason: !bothSeated ? 'waiting for an opponent' : (finished ? 'no pot was locked for this match' : 'only the match creator locks the pot') };
}
