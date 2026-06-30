import { useState, useMemo, useCallback } from 'react';
import { Coins, Lock, Trophy, ExternalLink, Loader2, ShieldCheck, AlertTriangle, Wallet, RotateCcw, Cpu } from '../lib/routeIcons.js';
import { useWallet } from './WalletContext';
import { lockPot, settlePot, settlePotHashlock, settlePotZkOnchain, refundPotHashlock, potState, zkOnchainGamesEnabled } from '../lib/gamePot';
import { explorerTxUrl } from '../lib/explorer';

/**
 * GamePotPanel: the real, non-custodial winner-receives-the-stake money control for any staked match.
 *
 * Drop-in: render it next to the game with the live game object + this seat's token. It reads the
 * on-chain pot state (game.pot_tx / game.pot_payout_tx / game.settle_mode, server fields) and shows
 * exactly one honest action for the viewer.
 *
 * Settlement paths, picked from game.settle_mode (new pots default to "hashlock" server-side):
 *
 *   ZK_GAME_SETTLE (KIP-16 on-chain ZK, GATED / rolling out): the winner PROVES the win and the
 *   CHAIN verifies it. The settlement covenant runs OpZkPrecompile (opcode 0xa6) on a
 *   RISC0->Groth16 proof whose journal binds { covenant_id, winner_pubkey }; consensus (not Covex,
 *   not a referee) verifies the proof, so the loser cannot forge a winning proof and no Covex key
 *   is in any path. This is NOT the live default: it needs both the build flag
 *   (zkOnchainGamesEnabled, VITE_ZK_ONCHAIN_GAMES) AND game.settle_mode === 'zk_game_settle', and
 *   it awaits the real game seal + an end-to-end proof on Covex prover infra. Framed honestly as "on-chain ZK (rolling
 *   out)". When the per-pot mode is set but the build flag is off, the panel says it is rolling out
 *   rather than offering a claim.
 *
 *   HASHLOCK (de-oracle, the default for new pots): the pot is a binary_oracle_select covenant with
 *   NO Covex key and NO referee key in the redeem - only the two player keys, two referee
 *   hashlocks, and a CSV refund to the funder. At the end the referee REVEALS the winner's secret
 *   and the WINNER releases the pot with their OWN key (Covex signs nothing). The loser cannot
 *   claim: the inscribed covenant (OpBlake2b + the winner's OpCheckSig) only lets the winner spend,
 *   and the referee will not reveal their secret. If the result cannot be resolved, the funder
 *   reclaims via the CSV refund branch once the pot ages.
 *
 *   ORACLE_ESCROW (legacy, already-deployed pots only): the older co-signed release. The result is
 *   recomputed by replaying the signed move log; the counterparty or a deployer-bound resolver
 *   co-signs the payout to the engine-verified winner, and your wallet signs your half locally. It
 *   is NOT trustless and has no refund branch, so the copy says so.
 *
 * Signing always needs an in-browser key wallet, exactly like covenant deploy - your signature is
 * made locally and only the signature bytes leave the browser.
 */

// One-click claim status -> human label. The winner never sees crypto jargon.
const CLAIM_STEPS = {
  proving: 'Checking your game proof...',
  building: 'Building the spend witness...',
  revealing: 'Releasing the winning secret...',
  signing: 'Signing with your wallet...',
  broadcast: 'Broadcasting the payout...',
  paid: 'Paid.',
};

export default function GamePotPanel({ covenantId, game, seatToken, network = 'mainnet', onChange, className = '' }) {
  const { address, isDevMode, devMode } = useWallet();
  const privKeyHex = isDevMode && devMode?.privateKeyHex ? devMode.privateKeyHex : '';
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { txid }

  const st = useMemo(() => potState(game, address), [game, address]);
  const potKas = st.potKas || game?.pot_amount_kas || 0;
  const zk = st.mode === 'zk_game_settle';        // this pot settles on-chain via KIP-16 ZK
  const zkLive = zk && zkOnchainGamesEnabled();    // ...and this build has the path enabled (rolling out)
  // "hashlock" covers everything that is NOT the legacy oracle co-sign and NOT the zk path, i.e. the
  // de-oracle winner-spends-with-own-key default. Kept as the catch-all so existing copy is unchanged.
  const hashlock = st.mode !== 'oracle_escrow' && !zk;

  const run = useCallback(async (fn) => {
    setBusy(true); setError(''); setResult(null); setStep('');
    try {
      const r = await fn();
      setResult(r);
      onChange?.(r);
    } catch (e) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setBusy(false); setStep('');
    }
  }, [onChange]);

  // Phases with no actionable control render nothing (keeps the arena uncluttered).
  if (!game || st.phase === 'unavailable') return null;

  const needsKey = !privKeyHex && (st.phase === 'lockable' || st.phase === 'claimable' || st.phase === 'refundable');

  // Honest trust note, matched to the actual settlement path of THIS pot.
  const trustNote = zk ? (
    <p className="text-[11px] leading-snug text-gray-400 light:text-slate-500 mt-2">
      On-chain ZK pot (rolling out). The winner proves the win and the Kaspa chain verifies the proof
      itself (KIP-16 OpZkPrecompile): no referee, no Covex key, and the loser cannot forge a winning
      proof. The proof is generated off-device and the chain re-checks it on the spend, so nothing is
      trusted on faith. This path is not the live default yet: it is gated and awaiting the real game
      seal and an end-to-end proof on Covex prover infrastructure. If the result cannot be resolved,
      the funder reclaims via the timelock refund branch.
    </p>
  ) : hashlock ? (
    <p className="text-[11px] leading-snug text-gray-400 light:text-slate-500 mt-2">
      On-chain pot. The winner releases it with their OWN key: Covex holds no key in the redeem and
      signs nothing. The loser cannot claim (the inscribed covenant only pays the winner, and the
      referee reveals only the winner's secret). No Covex trust on the spend; the referee is the
      disclosed secret-revealer, and a silent referee is covered by the funder's timelock refund,
      not by trusting Covex.
    </p>
  ) : (
    <p className="text-[11px] leading-snug text-gray-400 light:text-slate-500 mt-2">
      Legacy co-signed release: the result is computed deterministically by replaying the signed
      move log, and the counterparty or a deployer-bound external resolver co-signs the payout to
      the engine-verified winner. Your wallet signs your half in the browser (non-custodial). This
      is not trustless - that co-signer is in the payout path and this pot has no refund branch.
    </p>
  );

  const wrap = (children) => (
    <div className={`rounded-2xl border border-kaspa-green/25 light:border-emerald-300 bg-kaspa-green/[0.05] light:bg-emerald-50 light:shadow-sm p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <Coins size={15} className="text-kaspa-green light:text-emerald-700" />
        <span className="text-xs font-bold uppercase tracking-wider text-white light:text-slate-900">On-chain pot</span>
        <span className="ml-auto text-xs font-mono font-bold text-kaspa-green light:text-emerald-700">{potKas} KAS</span>
      </div>
      {children}
      {busy && step && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-300 light:text-slate-600">
          <Loader2 size={12} className="animate-spin shrink-0" /> <span>{CLAIM_STEPS[step] || 'Working...'}</span>
        </div>
      )}
      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-red-300 light:text-red-600">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {result?.deploy_tx_id || result?.payout_tx_id || result?.spend_tx_id || result?.tx_id || result?.txid ? (
        <a href={explorerTxUrl(result.deploy_tx_id || result.payout_tx_id || result.spend_tx_id || result.tx_id || result.txid, network)} target="_blank" rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-kaspa-green light:text-emerald-700 hover:underline font-semibold">
          View transaction <ExternalLink size={11} />
        </a>
      ) : null}
    </div>
  );

  if (needsKey) {
    return wrap(
      <div className="flex items-start gap-2 text-[12px] text-amber-200 light:text-amber-800">
        <Wallet size={14} className="mt-0.5 shrink-0" />
        <span>Real-money pots need an in-browser key wallet (import or dev-connect a key) so your signature is made locally. Wallet extensions cannot yet sign covenant inputs.</span>
      </div>,
    );
  }

  if (st.phase === 'lockable') {
    return wrap(
      <>
        <div className="text-[12px] text-gray-300 light:text-slate-700">
          Both seats are filled. Lock the <span className="font-bold">{potKas} KAS</span> stake into a real on-chain covenant.{' '}
          {zk
            ? 'At the end the winner proves the win and the Kaspa chain verifies the proof itself (KIP-16). This on-chain ZK path is rolling out.'
            : hashlock
              ? 'At the end the winner releases the whole pot with their own key. Covex holds no key and signs nothing.'
              : 'At the end the counterparty or a deployer-bound resolver co-signs the payout to the winner the engine verifies.'}
        </div>
        {zk || hashlock ? (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-gray-400 light:text-slate-500">
            <ShieldCheck size={12} className="text-kaspa-green light:text-emerald-700 mt-0.5 shrink-0" />
            <span>If the result cannot be resolved, you (the funder) can reclaim the stake via the timelock refund once the pot ages.</span>
          </div>
        ) : (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-200 light:text-amber-800">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>If the match draws or the co-signer is unavailable, this legacy pot has no refund branch and the stake can be permanently locked.</span>
          </div>
        )}
        <button type="button" disabled={busy}
          onClick={() => run(() => lockPot({ covenantId, token: seatToken, stakeKas: Number(potKas), network, privKeyHex }))}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-kaspa-green light:bg-[#0d9488] text-black light:text-white font-extrabold text-sm hover:brightness-110 disabled:opacity-50 transition">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
          {busy ? 'Locking the pot...' : `Lock ${potKas} KAS pot`}
        </button>
        {trustNote}
      </>,
    );
  }

  if (st.phase === 'locked') {
    return wrap(
      <div className="flex items-start gap-2 text-[12px] text-gray-300 light:text-slate-700">
        <ShieldCheck size={14} className="text-kaspa-green light:text-emerald-700 mt-0.5 shrink-0" />
        <span>
          {zk
            ? 'Stake locked on-chain. The full stake goes to the winner: when the result is decided, the winner proves the win and the chain verifies the proof (KIP-16 on-chain ZK, rolling out).'
            : hashlock
              ? 'Stake locked on-chain. The full stake goes to the winner: when the result is decided, the winner releases the staked amount to themselves with their own key.'
              : 'Stake locked on-chain. The full stake goes to the winner: when the engine decides the result, the winner claims it (the counterparty or a deployer-bound resolver co-signs the payout).'}
        </span>
      </div>,
    );
  }

  if (st.phase === 'claimable') {
    // A zk_game_settle pot whose on-chain ZK path is NOT enabled in this build: do not offer a
    // claim button (the route + seal are not live). Be honest that it is rolling out instead of
    // overclaiming or breaking. The funder's timelock refund still covers a stranded stake.
    if (zk && !zkLive) {
      return wrap(
        <>
          <div className="flex items-start gap-2 text-[12px] text-emerald-200 light:text-emerald-800 font-semibold">
            <Trophy size={14} className="mt-0.5 shrink-0" /> <span>You won the {potKas} KAS pot.</span>
          </div>
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-200 light:text-amber-800">
            <Cpu size={12} className="mt-0.5 shrink-0" />
            <span>
              This pot settles on-chain via ZK (KIP-16), where the winner proves the win and the chain
              verifies it. That path is rolling out and not enabled in this build yet, so the claim is
              not available here.
            </span>
          </div>
          {trustNote}
        </>,
      );
    }
    // ONE-CLICK winner claim. ZK pots (enabled) prove on-chain (the chain verifies the proof, no
    // referee, no Covex key); hashlock pots use the de-oracle path (winner releases with their own
    // key; no Covex signature); legacy oracle_escrow pots keep the co-signed settle.
    const claim = zkLive
      ? () => settlePotZkOnchain({ covenantId, token: seatToken, privKeyHex, onStatus: setStep })
      : hashlock
        ? () => settlePotHashlock({ covenantId, token: seatToken, privKeyHex, onStatus: setStep })
        : () => settlePot({ covenantId, token: seatToken, privKeyHex });
    const claimIcon = busy ? <Loader2 size={15} className="animate-spin" /> : (zkLive ? <Cpu size={15} /> : <Trophy size={15} />);
    const claimLabel = busy ? (CLAIM_STEPS[step] || 'Claiming...') : (zkLive ? `Prove and claim ${potKas} KAS` : `Claim ${potKas} KAS`);
    return wrap(
      <>
        <div className="flex items-start gap-2 text-[12px] text-emerald-200 light:text-emerald-800 font-semibold">
          <Trophy size={14} className="mt-0.5 shrink-0" /> <span>You won. Claim the {potKas} KAS pot.</span>
        </div>
        {zkLive && (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-gray-400 light:text-slate-500">
            <Cpu size={12} className="text-kaspa-green light:text-emerald-700 mt-0.5 shrink-0" />
            <span>On-chain ZK (rolling out): you prove the win and the chain verifies the proof before paying you. The proof is generated off-device; you only sign the spend.</span>
          </div>
        )}
        <button type="button" disabled={busy}
          onClick={() => run(claim)}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-kaspa-green light:bg-[#0d9488] text-black light:text-white font-extrabold text-sm hover:brightness-110 disabled:opacity-50 transition">
          {claimIcon}
          {claimLabel}
        </button>
        {trustNote}
      </>,
    );
  }

  if (st.phase === 'settling-other') {
    return wrap(
      <div className="text-[12px] text-gray-300 light:text-slate-700">
        The match is over. The winner can release the {potKas} KAS pot to their own wallet
        {zk
          ? ' by proving the win on-chain (KIP-16); the chain verifies the proof. Covex holds no key in this pot.'
          : hashlock
            ? ' with their own key. Covex holds no key in this pot.'
            : '.'}
      </div>,
    );
  }

  // Hashlock pot with an unresolved result, viewed by the funder: offer the CSV refund. The node
  // enforces the age window, so an early attempt is honestly reported as not-yet-aged.
  if (st.phase === 'refundable') {
    return wrap(
      <>
        <div className="flex items-start gap-2 text-[12px] text-amber-200 light:text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>This match has no verified winner. As the funder you can reclaim the {potKas} KAS stake via the timelock refund branch, once the pot has aged its lock window.</span>
        </div>
        <button type="button" disabled={busy}
          onClick={() => run(() => refundPotHashlock({ covenantId, token: seatToken, privKeyHex, onStatus: setStep }))}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-amber-500/90 light:bg-amber-600 text-black light:text-white font-extrabold text-sm hover:brightness-110 disabled:opacity-50 transition">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
          {busy ? (CLAIM_STEPS[step] || 'Reclaiming...') : `Reclaim ${potKas} KAS`}
        </button>
        <p className="text-[11px] leading-snug text-gray-400 light:text-slate-500 mt-2">
          The refund only confirms once the pot UTXO has aged the timelock window (node-enforced).
          You sign with your own key; Covex holds no key and signs nothing.
        </p>
      </>,
    );
  }

  if (st.phase === 'frozen') {
    return wrap(
      <div className="flex items-start gap-2 text-[12px] text-amber-200 light:text-amber-800">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>This match has no verified winner (a draw, or the result could not be resolved). This legacy pot has no refund branch, so the {potKas} KAS stake may be permanently locked on-chain.</span>
      </div>,
    );
  }

  if (st.phase === 'paid') {
    return wrap(
      <div className="flex items-start gap-2 text-[12px] text-emerald-200 light:text-emerald-800 font-semibold">
        <Trophy size={14} className="mt-0.5 shrink-0" /> <span>Pot paid out to the winner on-chain.</span>
      </div>,
    );
  }

  return null;
}
