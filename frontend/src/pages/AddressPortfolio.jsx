import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Wallet, Layers, Coins, Crown, ArrowLeft, ExternalLink } from 'lucide-react';
import CopyButton from '../components/CopyButton';
import { explorerAddressUrl } from '../lib/explorer';

// Mirror Stats.jsx EVENT_META/NETWORKS palette so the Address page and the
// Platform Statistics page show the same dot for the same network. testnet-12
// is purple (TN12), testnet-10 is amber (TN10), mainnet is the Covex teal.
const NETWORK_DOT_COLOR = {
  'mainnet':     '#49EACB',
  'mainnet-1':   '#49EACB',
  'testnet-10':  '#F59E0B',
  'testnet-12':  '#A78BFA',
};
const networkDotColor = (n) => NETWORK_DOT_COLOR[n] || '#9CA3AF';

/** Public portfolio for any Kaspa address: covenants created, totals, tier mix. */
export default function AddressPortfolio() {
  const { addr } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const network = localStorage.getItem('kaspaNetwork') || 'mainnet';

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
    setLoading(true);
    fetch(`/api/address/${encodeURIComponent(addr)}?network=${network}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [addr, network]);

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="covex-aurora" style={{ top: -10, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 460, height: 220, maxWidth: '90vw', opacity: 0.4 }} aria-hidden="true" />

      <div className="relative z-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 mb-8">
        <ArrowLeft size={14} /> Back to Explorer
      </Link>

      <div className="glass-panel detail-hero-enhanced rounded-2xl border border-white/[0.06] overflow-hidden mb-8">
        <div className="h-[3px] w-full shrink-0" aria-hidden="true"
          style={{ background: 'linear-gradient(90deg, transparent, #49EACB, transparent)', opacity: 0.8 }} />
        <div className="p-6 flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center shrink-0">
            <Wallet size={26} className="text-kaspa-green" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white light:text-slate-900 mb-1">Address Portfolio</h1>
            <div className="flex items-start gap-1.5 text-xs font-mono text-gray-400 light:text-slate-500">
              <span className="break-all">{addr}</span>
              <CopyButton value={addr} label="Copy address" size={12} className="mt-0.5" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className="text-[11px] text-gray-500 light:text-slate-500 inline-flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: networkDotColor(network) }} aria-hidden="true" />
                Network: {network}
              </p>
              <a
                href={explorerAddressUrl(addr, network)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-gray-400 light:text-slate-500 hover:text-kaspa-green light:hover:text-kaspa-green transition-colors"
                title="Open this address on the Kaspa block explorer"
              >
                View on explorer <ExternalLink size={11} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-panel rounded-2xl border border-white/[0.06] overflow-hidden">
                <div className="h-[3px] w-full shrink-0" aria-hidden="true"
                  style={{ background: 'linear-gradient(90deg, transparent, #49EACB, transparent)', opacity: 0.8 }} />
                <div className="p-4 flex items-center gap-3">
                  <div className="skeleton h-[18px] w-[18px] rounded-md shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="skeleton h-2.5 w-20" />
                    <div className="skeleton h-5 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="glass-panel rounded-2xl p-5 border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="skeleton h-4 w-32" />
                  <div className="skeleton h-4 w-16 shrink-0" />
                </div>
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            ))}
          </div>
        </>
      ) : !data || (data.covenants || []).length === 0 ? (
        <div className="glass-panel rounded-2xl px-4 sm:px-6 py-10 sm:py-14 text-center max-w-2xl mx-auto">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
            <Layers size={22} className="text-kaspa-green" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-white light:text-slate-900 mb-2 break-words">You have not deployed a covenant from this address yet.</h2>
          <p className="text-sm text-gray-400 light:text-slate-600 mb-6 max-w-md mx-auto break-words">Start with a hashlock: 1 KAS, consensus-enforced by Kaspa, no oracle in the path.</p>
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 justify-center items-stretch sm:items-center max-w-sm sm:max-w-none mx-auto">
            <Link
              to="/deploy/enforced?kind=hashlock"
              className="btn-shimmer inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-kaspa-green text-black font-semibold text-sm hover:bg-kaspa-green/90 transition-colors min-w-0"
            >
              Build a hashlock
            </Link>
            <Link
              to="/templates"
              className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl border border-white/10 light:border-slate-300 text-gray-200 light:text-slate-700 font-semibold text-sm hover:border-kaspa-green/40 hover:text-white light:hover:text-slate-900 transition-colors min-w-0"
            >
              Browse templates
            </Link>
          </div>
          <p className="text-[11px] text-gray-500 light:text-slate-500 mt-6 inline-flex flex-wrap items-center justify-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: networkDotColor(network) }} aria-hidden="true" />
            <span>Network: {network}. Covenants appear here as soon as the indexer discovers them.</span>
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[
              { icon: Layers, label: 'Covenants', value: data.total_covenants },
              { icon: Crown, label: 'Paid tier', value: data.paid_covenants },
              { icon: Coins, label: 'Total locked', value: `${(data.tvl_kas || 0).toLocaleString()} KAS` },
            ].map((s, i) => (
              <div key={i} className="glass-panel hover-lift rounded-2xl border border-white/[0.06] overflow-hidden">
                <div className="h-[3px] w-full shrink-0" aria-hidden="true"
                  style={{ background: 'linear-gradient(90deg, transparent, #49EACB, transparent)', opacity: 0.8 }} />
                <div className="p-4 flex items-center gap-3">
                  <s.icon size={18} className="text-kaspa-green shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 light:text-slate-500 font-mono uppercase tracking-wider truncate">{s.label}</p>
                    <p className="text-lg font-bold text-white light:text-slate-900 break-words">{s.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.covenants.map((c) => (
              <Link
                key={c.tx_id}
                to={`/covenant/${encodeURIComponent(c.tx_id)}`}
                className="glass-panel hover-lift rounded-2xl p-5 hover:border-kaspa-green/30 border border-white/[0.06]"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-bold text-white light:text-slate-900 truncate min-w-0">{c.name || c.covenant_type || 'Covenant'}</span>
                  <span className="text-xs font-mono text-kaspa-green shrink-0">{c.amount_kaspa} KAS</span>
                </div>
                <p className="text-xs text-gray-400 light:text-slate-500 line-clamp-2 break-words mb-3">{c.description || c.full_logic_summary || 'On-chain Kaspa covenant.'}</p>
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-gray-500">
                  <span className="truncate min-w-0">{c.category}</span>
                  <span className={`shrink-0 ${c.verified_tier !== 'FREE' ? 'text-amber-300 light:text-amber-600' : ''}`}>{c.verified_tier}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
