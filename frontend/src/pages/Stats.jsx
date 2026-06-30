import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Database, Coins, BadgeCheck, ArrowLeft } from '../lib/routeIcons.js';
import { TIER_COLOR as TIER_PALETTE_COLOR } from '../lib/tierPalette';
import { Card } from '@/components/ui/Card';
import { isMainnet } from '../lib/network';

// Public platform statistics, all computed live from the covenants, payments,
// and events tables (GET /api/stats). Real on-chain data only; the activity
// timeline reflects the rolling event window the backend retains.

// Single source of truth for every event_type the backend persists to the
// events table and the /api/stats timeline pivots over. Today the backend
// emits exactly these strings (search: record_event / record_event_once):
//   covenant_discovered  - crawler indexed a new covenant on Kaspa
//   tier_upgraded        - payment_verifier confirmed an on-chain tier payment
//   resolution_signed    - a deployer-bound external resolver signed an outcome
//   covenant_reorged     - the discovery block left the selected chain
//   game_finished        - a two-party covenant settled a result off-chain
// tier_upgraded sources its color from tierPalette so the Stats event chart
// and the Pricing/Explorer PRO surfaces share one hex (#E8AF34, Kaspa-gold).
// The remaining hues reuse the KPI accents (#49EACB / #A78BFA / #EF4444) so
// the legend reads as the same accent family across the page. covenant_reorged
// uses the same red the inflow KPI uses, signalling a chain-state correction.
// game_finished gets a distinct steel-blue so it does not collide visually
// with discovered or resolutions.
const EVENT_META = {
  covenant_discovered: { label: 'Discovered',         color: '#49EACB' },
  tier_upgraded:       { label: 'Tier upgrades',      color: TIER_PALETTE_COLOR.PRO },
  resolution_signed:   { label: 'Resolutions',        color: '#A78BFA' },
  covenant_reorged:    { label: 'Reorgs',             color: '#EF4444' },
  game_finished:       { label: 'Two-party settled',  color: '#60A5FA' },
};
// Graceful fallback for any new event_type the backend may add before this
// map catches up: split on underscores, capitalize each word. Returns
// "Market Resolution Signed" not "market resolution_signed".
const humanizeEventType = (t) =>
  String(t || '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
const eventMeta = (t) => EVENT_META[t] || { label: humanizeEventType(t), color: '#6B7280' };

// Tier identity sourced from the shared palette so BUILDER/PRO/MAX match Pricing,
// Explorer, and PremiumBuilder exactly. EXPLORER is a server-side legacy alias
// for FREE, kept here so historic event payloads still color correctly.
const TIER_COLOR = { ...TIER_PALETTE_COLOR, EXPLORER: TIER_PALETTE_COLOR.FREE };

const fmtKas = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(2).replace(/\.00$/, '');
};
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-US');

function Kpi({ icon: Icon, label, value, sub, accent }) {
  return (
    <Card hover accent={accent} className="bg-white/[0.02] shadow-none backdrop-blur-none">
      <div className="p-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-gray-400">
          <Icon size={14} style={{ color: accent }} /> {label}
        </div>
        <div className="num mt-2 text-4xl font-black tracking-[-0.02em] leading-none text-white light:text-slate-900">{value}</div>
        {sub && <div className="text-[11px] text-gray-500 mt-1.5">{sub}</div>}
      </div>
    </Card>
  );
}

// Horizontal bar list (tiers, categories)
function BarList({ rows, max, colorFor, labelKey, valueKey, valueFmt }) {
  if (!rows.length) return <div className="text-xs text-gray-500 py-4">No data for this network yet.</div>;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const v = Number(r[valueKey]) || 0;
        const pct = max > 0 ? Math.max(2, (v / max) * 100) : 0;
        return (
          <div key={r[labelKey]} className="flex items-center gap-3 rounded-md -mx-1 px-1 py-0.5 hover:bg-white/[0.02] light:hover:bg-slate-50 transition-colors">
            <div className="w-28 shrink-0 text-[11px] font-mono text-gray-300 light:text-slate-600 truncate" title={r[labelKey]}>{r[labelKey]}</div>
            <div className="flex-1 h-5 rounded-md bg-white/[0.03] light:bg-slate-100 overflow-hidden">
              <div className="h-full rounded-md transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: colorFor(r) }} />
            </div>
            <div className="num w-24 shrink-0 text-right text-[11px] text-gray-300 light:text-slate-600">{valueFmt(v)}</div>
          </div>
        );
      })}
    </div>
  );
}

// Stacked daily activity bars built from the pivoted timeline
function ActivityChart({ days, types }) {
  if (!days.length) return <div className="text-xs text-gray-500 py-6 text-center">No recent activity events recorded for this network.</div>;
  const maxTotal = Math.max(...days.map((d) => d.total), 1);
  const W = 760, H = 200, padB = 22, padL = 4;
  const n = days.length;
  const gap = 4;
  // cap bar width so a 1-2 day window shows tidy bars, not a full-width slab
  const bw = Math.min(64, Math.max(3, (W - padL * 2 - gap * (n - 1)) / n));
  const span = n * bw + (n - 1) * gap;
  const x0 = span < W - padL * 2 ? (W - span) / 2 : padL; // center when sparse
  const showEvery = Math.ceil(n / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily activity">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={padL} x2={W - padL} y1={(H - padB) * (1 - g)} y2={(H - padB) * (1 - g)} stroke="currentColor" strokeOpacity="0.07" />
      ))}
      {days.map((d, i) => {
        let yTop = H - padB;
        const x = x0 + i * (bw + gap);
        return (
          <g key={d.day}>
            {types.map((t) => {
              const val = d[t] || 0;
              if (!val) return null;
              const h = ((H - padB) * val) / maxTotal;
              yTop -= h;
              return <rect key={t} x={x} y={yTop} width={bw} height={h} fill={eventMeta(t).color} rx="1">
                <title>{`${d.day} · ${eventMeta(t).label}: ${val}`}</title>
              </rect>;
            })}
            {i % showEvery === 0 && (
              <text x={x + bw / 2} y={H - 7} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.4">{d.day.slice(5)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function Stats() {
  // To a user there is just Kaspa, so the stats are scoped to the live network. The backend
  // still understands every network string; this page simply asks for Kaspa's numbers.
  const [network] = useState('mainnet');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
    setLoading(true);
    setErr(null);
    fetch(`/api/stats?network=${network}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { if (d.error) setErr(d.error); else setData(d); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [network]);

  const tiers = useMemo(() => {
    const order = ['MAX', 'PRO', 'BUILDER', 'FREE', 'EXPLORER'];
    return [...(data?.by_tier || [])].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
  }, [data]);
  const maxTierCount = Math.max(1, ...tiers.map((t) => t.count));

  const cats = data?.by_category || [];
  const maxCatCount = Math.max(1, ...cats.map((c) => c.count));

  // pivot timeline [{day,event_type,count}] -> [{day, <type>:count, total}]
  const { days, activeTypes } = useMemo(() => {
    const rows = data?.timeline || [];
    const byDay = new Map();
    const typeSet = new Set();
    for (const r of rows) {
      typeSet.add(r.event_type);
      const d = byDay.get(r.day) || { day: r.day, total: 0 };
      d[r.event_type] = (d[r.event_type] || 0) + r.count;
      d.total += r.count;
      byDay.set(r.day, d);
    }
    return { days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)), activeTypes: [...typeSet] };
  }, [data]);

  const s = data?.summary || {};

  return (
    <div className="relative max-w-5xl mx-auto px-4 py-8">
      <div className="covex-aurora" style={{ top: -20, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 420, height: 200, maxWidth: '90vw', opacity: 0.4 }} aria-hidden="true" />

      <div className="relative z-10">
      <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-kaspa-green mb-4"><ArrowLeft size={14} /> Explorer</Link>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="h-page text-white light:text-slate-900">The numbers, live and on-chain</h1>
          <p className="text-sm text-gray-400 light:text-slate-600 mt-1">Live aggregates from indexed covenants, confirmed treasury payments, and on-chain activity. Real data only.</p>
        </div>
        <span className="self-start inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] font-semibold text-gray-300 light:bg-white light:border-slate-200 light:text-slate-700">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#49EACB' }} /> Kaspa
        </span>
      </div>

      {loading && (
        <div className="space-y-6" aria-hidden="true">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[104px]" />)}
          </div>
          <div className="skeleton h-[280px]" />
        </div>
      )}
      {err && !loading && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">Could not load stats: {err}</div>}

      {data && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Database} label="Covenants" value={fmtNum(s.total_covenants)} sub={`${fmtNum(s.active_covenants)} active`} accent="#49EACB" />
            <Kpi icon={Coins} label="Total value locked" value={`${fmtKas(s.tvl_kas)}`} sub="KAS across covenants" accent="#F59E0B" />
            <Kpi icon={BadgeCheck} label="Provably paid" value={fmtNum(s.paid_covenants)} sub="confirmed tier payments" accent="#A78BFA" />
            <Kpi icon={Activity} label="Treasury inflow" value={`${fmtKas(s.treasury_inflow_kas)}`} sub={`${fmtNum(s.confirmed_payments)} payments`} accent="#EF4444" />
          </div>

          {/* Activity timeline */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:bg-white light:border-slate-200">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h2 className="text-sm font-semibold text-white light:text-slate-900">Recent activity</h2>
              <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[10px] text-gray-400 light:text-slate-500">
                {activeTypes.map((t) => (
                  <span key={t} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: eventMeta(t).color }} /> {eventMeta(t).label}</span>
                ))}
              </div>
            </div>
            <div className="text-gray-500"><ActivityChart days={days} types={activeTypes} /></div>
            <p className="text-[10px] text-gray-500 mt-2">{data.timeline_note}</p>
          </section>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Tier distribution */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:bg-white light:border-slate-200">
              <h2 className="text-sm font-semibold text-white light:text-slate-900 mb-3">Covenants by tier</h2>
              <BarList rows={tiers} max={maxTierCount} labelKey="tier" valueKey="count"
                colorFor={(r) => TIER_COLOR[r.tier] || '#6B7280'} valueFmt={(v) => fmtNum(v)} />
            </section>

            {/* Category breakdown */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:bg-white light:border-slate-200">
              <h2 className="text-sm font-semibold text-white light:text-slate-900 mb-3">Top categories</h2>
              <BarList rows={cats} max={maxCatCount} labelKey="category" valueKey="count"
                colorFor={() => '#49EACB'} valueFmt={(v) => fmtNum(v)} />
            </section>
          </div>

          {/* Per-network comparison */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 light:bg-white light:border-slate-200">
            <h2 className="text-sm font-semibold text-white light:text-slate-900 mb-3">Networks</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-widest text-gray-500 text-left">
                    <th className="py-1.5 font-medium">Network</th>
                    <th className="py-1.5 font-medium text-right">Covenants</th>
                    <th className="py-1.5 font-medium text-right">Provably paid</th>
                    <th className="py-1.5 font-medium text-right">TVL (KAS)</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.by_network || []).filter((n) => isMainnet(n.network)).map((n) => (
                    <tr key={n.network} className="border-t border-white/5 light:border-slate-100 hover:bg-white/[0.02] light:hover:bg-slate-50 transition-colors">
                      <td className="py-2 font-mono text-gray-200 light:text-slate-700">
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: '#49EACB' }} />
                        Kaspa
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-200 light:text-slate-700">{fmtNum(n.covenants)}</td>
                      <td className="py-2 text-right tabular-nums text-gray-200 light:text-slate-700">{fmtNum(n.paid)}</td>
                      <td className="py-2 text-right tabular-nums text-gray-200 light:text-slate-700">{fmtKas(n.tvl_kas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      </div>
    </div>
  );
}
