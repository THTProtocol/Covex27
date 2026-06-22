import { Users, Wallet } from 'lucide-react';
import { useWallet } from './WalletContext';

/**
 * Shared create/join control for every arena game (chess, poker, reversi, ...).
 *
 * One vocabulary across all eight games: "Create match" when the table is empty,
 * "Join match" when a creator is waiting. The creator takes the first seat and
 * locks the stake; the joiner matches it. A logged-out visitor never gets a dead
 * click: the button is disabled and relabeled "Connect wallet to take a seat",
 * wired straight to the connect modal. Spectating stays open without a wallet.
 *
 * Honesty: the subline states that the result is computed deterministically by
 * replaying the signed move log (off-chain, server-authoritative, anyone can
 * recompute) and the counterparty or a deployer-bound external resolver co-signs
 * the release, while custody and payout are on-chain. This is not trustless and
 * the copy never says otherwise.
 */
export default function SeatButton({
  status,
  joining,
  walletConnected,
  onJoin,
  stake,
  // Per-game seat hint shown under the action, e.g. "You take white. Your
  // opponent joins as black." Optional; kept short.
  seatHint,
  className = '',
}) {
  const { connect, connecting } = useWallet();
  const isCreate = status === 'none';
  const action = isCreate ? 'Create match' : 'Join match';

  if (!walletConnected) {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <button
          type="button"
          onClick={() => connect?.()}
          disabled={connecting}
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold rounded-2xl text-sm flex items-center gap-2 transition-all"
        >
          <Wallet size={16} /> {connecting ? 'CONNECTING...' : 'Connect wallet to take a seat'}
        </button>
        <p className="text-[11px] text-gray-300 light:text-slate-600 text-center max-w-[280px] leading-snug">
          Spectating works without a wallet.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onJoin}
        disabled={joining}
        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold rounded-2xl text-sm flex items-center gap-2 transition-all"
      >
        <Users size={16} /> {joining ? 'JOINING...' : action}
      </button>
      <p className="text-[11px] text-gray-300 light:text-slate-600 text-center max-w-[300px] leading-snug">
        {isCreate
          ? <>You take the first seat and lock {stake} KAS. Share this page so an opponent can join by matching it.</>
          : <>Match the staked amount to join: {stake} KAS.</>}
        {seatHint ? <span className="block text-gray-400 light:text-slate-500 mt-0.5">{seatHint}</span> : null}
      </p>
    </div>
  );
}

/**
 * One-line honesty note for the staking decision. Sits next to the create/join
 * control so the on-chain-vs-oracle disclosure is visible at the moment money is
 * committed, not buried in a 9px footer.
 */
export function TrustNote({ className = '' }) {
  return (
    <p className={`text-[11px] leading-snug text-gray-400 light:text-slate-500 text-center max-w-[340px] ${className}`}>
      The result is computed deterministically by replaying the signed move log off-chain (server-authoritative,
      anyone can recompute), not by Kaspa consensus; the counterparty or a deployer-bound external resolver co-signs the
      release. Custody and payout are on-chain. This is not trustless.
    </p>
  );
}
