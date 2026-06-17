import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Wallet, Layers, Coins, Crown, ArrowLeft, Copy, Check } from 'lucide-react';

/** Public portfolio for any Kaspa address: covenants created, totals, tier mix. */
export default function AddressPortfolio() {
  const { addr } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const network = localStorage.getItem('kaspaNetwork') || 'testnet-12';

  useEffect(() => {
    setLoading(true);
    fetch(`/api/address/${encodeURIComponent(addr)}?network=${network}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [addr, network]);

  const copy = () => {
    navigator.clipboard?.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 mb-8">
        <ArrowLeft size={14} /> Back to Explorer
      </Link>

      <div className="flex items-start gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center shrink-0">
          <Wallet size={26} className="text-kaspa-green" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-white light:text-slate-900 mb-1">Address Portfolio</h1>
          <button onClick={copy} className="flex items-start gap-2 text-xs font-mono text-gray-400 light:text-slate-500 hover:text-kaspa-green transition-colors break-all text-left">
            <span className="break-all">{addr}</span> {copied ? <Check size={12} className="text-kaspa-green shrink-0 mt-0.5" /> : <Copy size={12} className="shrink-0 mt-0.5" />}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-kaspa-green/30 border-t-kaspa-green animate-spin" /></div>
      ) : !data || (data.covenants || []).length === 0 ? (
        <div className="glass-panel rounded-2xl py-16 text-center">
          <p className="text-gray-300 light:text-slate-700 font-semibold mb-1">No covenants created by this address on {network}</p>
          <p className="text-gray-500 light:text-slate-500 text-xs">Covenants appear here as soon as the indexer discovers them on-chain.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[
              { icon: Layers, label: 'Covenants', value: data.total_covenants },
              { icon: Crown, label: 'Paid tier', value: data.paid_covenants },
              { icon: Coins, label: 'Total locked', value: `${(data.tvl_kas || 0).toLocaleString()} KAS` },
            ].map((s, i) => (
              <div key={i} className="glass-panel rounded-2xl p-4 flex items-center gap-3">
                <s.icon size={18} className="text-kaspa-green shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 light:text-slate-500 font-mono uppercase tracking-wider truncate">{s.label}</p>
                  <p className="text-lg font-bold text-white light:text-slate-900 break-words">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.covenants.map((c) => (
              <Link
                key={c.tx_id}
                to={`/covenant/${encodeURIComponent(c.tx_id)}`}
                className="glass-panel rounded-2xl p-5 hover:border-kaspa-green/30 border border-white/[0.06] transition-all hover:-translate-y-0.5"
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
  );
}
