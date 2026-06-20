import { useState, useMemo, useCallback } from 'react';
import { Coins, Lock, Trophy, ExternalLink, Loader2, ShieldCheck, AlertTriangle, Wallet } from 'lucide-react';
import { useWallet } from './WalletContext';
import { lockPot, settlePot, potState } from '../lib/gamePot';
import { explorerTxUrl } from '../lib/explorer';

/**
 * GamePotPanel: the real, non-custodial "winner takes all" money control for any arena game.
 *
 * Drop-in: render it next to the game with the live game object + this seat's token. It reads
 * the on-chain pot state (game.pot_tx / game.pot_payout_tx, server fields) and shows exactly
 * one honest action for the viewer:
 *   - funder, both seats filled, game live   -> Lock the stake on-chain (oracle_escrow)
 *   - pot locked, game live                  -> "Pot locked, winner takes all" (read-only)
 *   - pot locked, game over, viewer won      -> Claim your winnings (oracle co-signs)
 *   - pot paid                               -> link to the payout tx
 *
 * Honesty: this is the ORACLE-ATTESTED pot. The disclosed Covex oracle co-signs the payout to
 * the server-authoritative engine's verified winner; your wallet signs your half in the
 * browser (non-custodial). It is NOT trustless and there is no refund branch on this kind, so
 * the copy says so. The signing needs an in-browser key wallet, exactly like covenant deploy.
 */
export default function GamePotPanel({ covenantId, gameType = 'chess', game, seatToken, network = 'testnet-12', onChange, className = '' }) {
  const { address, isDevMode, devMode } = useWallet();
  const privKeyHex = isDevMode && devMode?.privateKeyHex ? devMode.privateKeyHex : '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { txid }

  const st = useMemo(() => potState(game, address), [game, address]);
  const potKas = st.potKas || game?.pot_amount_kas || 0;

  const run = useCallback(async (fn) => {
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await fn();
      setResult(r);
      onChange?.(r);
    } catch (e) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, [onChange]);

  // Phases with no actionable control render nothing (keeps the arena uncluttered).
  if (!game || st.phase === 'unavailable') return null;

  const needsKey = !privKeyHex && (st.phase === 'lockable' || st.phase === 'claimable');

  const trustNote = (
    <p className="text-[11px] leading-snug text-gray-400 light:text-slate-500 mt-2">
      Oracle-attested: the disclosed Covex oracle co-signs the payout to the engine-verified winner. Your wallet signs
      your half in the browser (non-custodial, custody on-chain). This is not trustless - the oracle is in the payout
      path and this pot has no refund branch.
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
      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-red-300 light:text-red-600">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {result?.deploy_tx_id || result?.payout_tx_id || result?.tx_id ? (
        <a href={explorerTxUrl(result.deploy_tx_id || result.payout_tx_id || result.tx_id, network)} target="_blank" rel="noreferrer"
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
          Both seats are filled. Lock the <span className="font-bold">{potKas} KAS</span> stake into a real on-chain 2-of-2 escrow. At the end, the disclosed oracle co-signs the payout to the winner the engine verifies.
        </div>
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-200 light:text-amber-800">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>If the match draws or the oracle is unavailable, this oracle pot has no refund branch and the stake can be permanently locked.</span>
        </div>
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
        <span>Pot locked on-chain. Winner takes all: when the engine decides the result, the winner claims it (the oracle co-signs the payout to them).</span>
      </div>,
    );
  }

  if (st.phase === 'claimable') {
    return wrap(
      <>
        <div className="flex items-start gap-2 text-[12px] text-emerald-200 light:text-emerald-800 font-semibold">
          <Trophy size={14} className="mt-0.5 shrink-0" /> <span>You won. Claim the {potKas} KAS pot.</span>
        </div>
        <button type="button" disabled={busy}
          onClick={() => run(() => settlePot({ covenantId, token: seatToken, privKeyHex }))}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-kaspa-green light:bg-[#0d9488] text-black light:text-white font-extrabold text-sm hover:brightness-110 disabled:opacity-50 transition">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Trophy size={15} />}
          {busy ? 'Claiming...' : `Claim ${potKas} KAS`}
        </button>
        {trustNote}
      </>,
    );
  }

  if (st.phase === 'settling-other') {
    return wrap(
      <div className="text-[12px] text-gray-300 light:text-slate-700">The match is over. The winner can claim the {potKas} KAS pot to their wallet.</div>,
    );
  }

  if (st.phase === 'frozen') {
    return wrap(
      <div className="flex items-start gap-2 text-[12px] text-amber-200 light:text-amber-800">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>This match has no verified winner (a draw, or the oracle could not resolve it). This oracle pot has no refund branch, so the {potKas} KAS stake may be permanently locked on-chain.</span>
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
