import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, ArrowUpRight, Scale, Coins, ExternalLink } from 'lucide-react';
import Card from '@/components/ui/Card';
import { explorerTxUrl } from '@/lib/explorer';

const TREASURIES = {
  mainnet: 'kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2',
};

/**
 * Tiny inline SVG sparkline of payment volume (KAS per time-bucket) over the
 * events window. No chart library; pure SVG. Buckets the upgrade events into
 * BUCKETS slices by timestamp and sums amount_kaspa per slice.
 */
function VolumeSparkline({ upgrades }) {
  const BUCKETS = 24;
  const points = useMemo(() => {
    if (!upgrades || upgrades.length === 0) return null;
    const ts = upgrades.map((u) => u.timestamp).filter((t) => Number.isFinite(t));
    if (ts.length === 0) return null;
    const min = Math.min(...ts);
    const max = Math.max(...ts);
    const span = Math.max(1, max - min);
    const bins = new Array(BUCKETS).fill(0);
    for (const u of upgrades) {
      const t = u.timestamp;
      if (!Number.isFinite(t)) continue;
      const idx = Math.min(BUCKETS - 1, Math.floor(((t - min) / span) * BUCKETS));
      bins[idx] += Number(u.amount_kaspa) || 0;
    }
    const peak = Math.max(...bins, 0);
    return { bins, peak };
  }, [upgrades]);

  if (!points) {
    return (
      <p className="text-xs text-gray-500 light:text-slate-400">No payments in this window.</p>
    );
  }
  const { bins, peak } = points;
  const W = 320;
  const H = 40;
  const stepX = W / Math.max(1, bins.length - 1);
  const path = bins
    .map((v, i) => {
      const x = i * stepX;
      const y = peak === 0 ? H - 1 : H - 1 - (v / peak) * (H - 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const areaPath = `${path} L${W},${H} L0,${H} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-10 mt-2"
      aria-label="Payment volume sparkline over the events window"
      role="img"
    >
      <defs>
        <linearGradient id="cvx-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#49EACB" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#49EACB" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#cvx-spark-fill)" />
      <path d={path} fill="none" stroke="#49EACB" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

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
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500 mb-2 flex items-center gap-1.5">
            <Coins size={12} /> Live treasury balance
            <span className="ml-auto flex items-center gap-1 text-kaspa-green/90" title="Watching this address on-chain">
              <span className="relative inline-flex w-2 h-2" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-kaspa-green/60 motion-safe:animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-kaspa-green" />
              </span>
              <span className="text-[9px] font-bold tracking-wider">WATCH LIVE</span>
            </span>
          </p>
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
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p className="text-sm font-bold text-white light:text-slate-900">Recent tier payments (on-chain)</p>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 light:text-slate-400">Volume / window</p>
        </div>
        <VolumeSparkline upgrades={upgrades} />
        {upgrades.length === 0 ? (
          <p className="text-xs text-gray-500 light:text-slate-400 mt-4">No tier upgrades recorded in the recent event window. New payments appear here within 15 seconds of confirmation.</p>
        ) : (
          <div className="space-y-2 mt-4">
            {upgrades.slice(0, 20).map((u) => {
              // For tier_upgraded events the `covenant_id` column carries the on-chain tx id
              // (see payment_verifier.rs). Link the row out to the network-correct explorer.
              const txUrl = explorerTxUrl(u.covenant_id, u.network || network);
              return (
                <a
                  key={u.id}
                  href={txUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View payment on Kaspa explorer"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-xl bg-white/[0.02] light:bg-slate-50 border border-white/[0.05] light:border-slate-200 text-xs hover:bg-white/[0.04] light:hover:bg-slate-100 hover:border-kaspa-green/30 transition-colors"
                >
                  <span className="font-bold text-amber-300 light:text-amber-600 shrink-0">{u.detail}</span>
                  <span className="font-mono text-gray-400 light:text-slate-500 truncate flex-1 min-w-0">{u.covenant_id.slice(0, 24)}...</span>
                  <span className="font-mono text-white light:text-slate-900 shrink-0 tabular-nums">{u.amount_kaspa} KAS</span>
                  <span className="text-gray-500 light:text-slate-400 shrink-0 w-full sm:w-auto sm:text-right tabular-nums">{new Date(u.timestamp * 1000).toLocaleString()}</span>
                  <ExternalLink size={11} className="text-gray-500 light:text-slate-400 shrink-0" aria-hidden="true" />
                </a>
              );
            })}
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
