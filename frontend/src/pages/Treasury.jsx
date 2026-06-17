import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, ArrowUpRight, Scale, Coins } from 'lucide-react';

const TREASURIES = {
  'testnet-12': 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m',
  'testnet-10': 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m',
  mainnet: 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2',
};

/**
 * Public treasury transparency: where tier payments go, live balance,
 * recent on-chain tier upgrades, and the exact ranking formula.
 * Covex asks creators for transparency, so the platform shows its own first.
 */
export default function Treasury() {
  const network = localStorage.getItem('kaspaNetwork') || 'testnet-12';
  const treasury = TREASURIES[network] || TREASURIES['testnet-12'];
  const [balance, setBalance] = useState(null);
  const [upgrades, setUpgrades] = useState([]);

  useEffect(() => {
    fetch(`/api/balance/${encodeURIComponent(treasury)}?network=${network}`)
      .then((r) => r.json())
      .then((d) => setBalance(typeof d.balance === 'number' ? d.balance / 1e8 : null))
      .catch(() => {});
    fetch(`/api/events?network=${network}&limit=100`)
      .then((r) => r.json())
      .then((d) => setUpgrades((d.events || []).filter((e) => e.event_type === 'tier_upgraded')))
      .catch(() => {});
  }, [treasury, network]);

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 shrink-0 rounded-2xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
          <Landmark size={22} className="text-kaspa-green" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black text-white">Treasury Transparency</h1>
          <p className="text-sm text-gray-400">Every tier payment is an on-chain transaction to a public address. Verify everything yourself.</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-8">Network: {network}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5"><Coins size={12} /> Live treasury balance</p>
          <p className="text-2xl font-black text-white">{balance === null ? '...' : `${balance.toLocaleString()} KAS`}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Treasury address</p>
          <p className="text-[11px] font-mono text-kaspa-green break-all">{treasury}</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 border border-white/[0.06] mb-8">
        <p className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Scale size={16} className="text-kaspa-green" /> How visibility ranking works</p>
        <p className="text-xs text-gray-300 leading-relaxed mb-3">
          Explorer ordering is deterministic and public. Paid placement is always ranked above free listings and is never hidden:
        </p>
        <pre className="text-[11px] font-mono text-gray-300 bg-black/40 border border-white/[0.06] rounded-xl p-3 overflow-x-auto">{`rank = tier_weight  (MAX 100, PRO 50, BUILDER 10, FREE 0)
     then amount_kaspa (locked value, descending)
     then timestamp    (newest first)`}</pre>
        <p className="text-xs text-gray-400 mt-3">
          Verification is a fact, not a purchase: the VERIFIED badge means a tier payment was confirmed on-chain with 6 DAA confirmations to the treasury above. Nothing else can grant it.
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
        <p className="text-sm font-bold text-white mb-4">Recent tier payments (on-chain)</p>
        {upgrades.length === 0 ? (
          <p className="text-xs text-gray-500">No tier upgrades recorded in the recent event window. New payments appear here within 15 seconds of confirmation.</p>
        ) : (
          <div className="space-y-2">
            {upgrades.slice(0, 20).map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs">
                <span className="font-bold text-amber-300 shrink-0">{u.detail}</span>
                <span className="font-mono text-gray-400 truncate flex-1 min-w-0">{u.covenant_id.slice(0, 24)}...</span>
                <span className="font-mono text-white shrink-0">{u.amount_kaspa} KAS</span>
                <span className="text-gray-500 shrink-0 w-full sm:w-auto sm:text-right">{new Date(u.timestamp * 1000).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center mt-8">
        <Link to="/pricing" className="inline-flex items-center gap-1.5 text-sm text-kaspa-green hover:underline">
          View tiers and pricing <ArrowUpRight size={14} />
        </Link>
      </p>
    </div>
  );
}
