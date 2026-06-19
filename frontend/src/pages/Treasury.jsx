import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, ArrowUpRight, Scale, Coins } from 'lucide-react';
import Card from '@/components/ui/Card';

const TREASURIES = {
  mainnet: 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2',
};

/**
 * Public treasury transparency: where tier payments go, live balance,
 * recent on-chain tier upgrades, and the exact ranking formula.
 * Covex asks creators for transparency, so the platform shows its own first.
 */
export default function Treasury() {
  const network = localStorage.getItem('kaspaNetwork') || 'mainnet';
  const treasury = TREASURIES[network] || TREASURIES['mainnet'];
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
    <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="covex-aurora" style={{ top: -10, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 420, height: 200, maxWidth: '90vw', opacity: 0.4 }} aria-hidden="true" />

      <div className="relative z-10">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 shrink-0 rounded-2xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
          <Landmark size={22} className="text-kaspa-green" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black text-white light:text-slate-900">Treasury Transparency</h1>
          <p className="text-sm text-gray-400 light:text-slate-500">Every tier payment is an on-chain transaction to a public address. Verify everything yourself.</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 light:text-slate-400 mb-8">Network: {network}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Card hover accent="#49EACB" className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500 mb-2 flex items-center gap-1.5"><Coins size={12} /> Live treasury balance</p>
          {balance === null
            ? <div className="skeleton h-7 w-40 mt-1" />
            : <p className="text-2xl font-black text-white light:text-slate-900 tabular-nums">{`${balance.toLocaleString()} KAS`}</p>}
        </Card>
        <Card hover accent="#49EACB" className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500 mb-2">Treasury address</p>
          <p className="text-[11px] font-mono text-kaspa-green break-all">{treasury}</p>
        </Card>
      </div>

      <Card className="p-6 mb-8">
        <p className="text-sm font-bold text-white light:text-slate-900 mb-3 flex items-center gap-2"><Scale size={16} className="text-kaspa-green" /> How visibility ranking works</p>
        <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed mb-3">
          Explorer ordering is deterministic and public. Paid placement is always ranked above free listings and is never hidden:
        </p>
        <pre className="text-[11px] font-mono text-gray-300 light:text-slate-600 bg-black/40 light:bg-slate-50 border border-white/[0.06] light:border-slate-200 rounded-xl p-3 overflow-x-auto tabular-nums">{`rank = tier_weight  (MAX 100, PRO 50, BUILDER 10, FREE 0)
     then amount_kaspa (locked value, descending)
     then timestamp    (newest first)`}</pre>
        <p className="text-xs text-gray-400 light:text-slate-500 mt-3">
          Verification is a fact, not a purchase: the VERIFIED badge means a tier payment was confirmed on-chain with 6 DAA confirmations to the treasury above. Nothing else can grant it.
        </p>
      </Card>

      <Card className="p-6">
        <p className="text-sm font-bold text-white light:text-slate-900 mb-4">Recent tier payments (on-chain)</p>
        {upgrades.length === 0 ? (
          <p className="text-xs text-gray-500 light:text-slate-400">No tier upgrades recorded in the recent event window. New payments appear here within 15 seconds of confirmation.</p>
        ) : (
          <div className="space-y-2">
            {upgrades.slice(0, 20).map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-xl bg-white/[0.02] light:bg-slate-50 border border-white/[0.05] light:border-slate-200 text-xs hover:bg-white/[0.04] light:hover:bg-slate-100 transition-colors">
                <span className="font-bold text-amber-300 light:text-amber-600 shrink-0">{u.detail}</span>
                <span className="font-mono text-gray-400 light:text-slate-500 truncate flex-1 min-w-0">{u.covenant_id.slice(0, 24)}...</span>
                <span className="font-mono text-white light:text-slate-900 shrink-0 tabular-nums">{u.amount_kaspa} KAS</span>
                <span className="text-gray-500 light:text-slate-400 shrink-0 w-full sm:w-auto sm:text-right tabular-nums">{new Date(u.timestamp * 1000).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-center mt-8">
        <Link to="/pricing" className="inline-flex items-center gap-1.5 text-sm text-kaspa-green hover:underline">
          View tiers and pricing <ArrowUpRight size={14} />
        </Link>
      </p>
      </div>
    </div>
  );
}
