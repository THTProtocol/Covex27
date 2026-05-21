import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const KAS = (s) => (s / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TRUNC = (s, n = 10) => (s && s.length > n * 2 + 2 ? `${s.slice(0, n)}...${s.slice(-n)}` : s);

const TIER_COLORS = {
  FREE: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  EXPLORER: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  CREATOR: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PRO: 'bg-kaspa-gold/10 text-kaspa-gold border-kaspa-gold/20',
  MAX: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const VERIFICATION_BADGE = {
  FREE: null,
  EXPLORER: null,
  CREATOR: 'VERIFIED',
  PRO: 'VERIFIED',
  MAX: 'VERIFIED',
};

const CATEGORY_COLORS = {
  'Skill Contests': '#49EACB',
  'Predictive Markets': '#E8AF34',
  'Escrow & Custody': '#818CF8',
  Tournaments: '#F59E0B',
  'Community Pools': '#10B981',
  'Flash Covenants': '#EC4899',
  Governance: '#6366F1',
  General: '#6B7280',
};

export default function Explorer() {
  const [covenants, setCovenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ total: 0, active: 0, totalKas: 0 });
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [liveStats, setLiveStats] = useState({ bps: 10, tps: 0, indexed: 0 });

  const fetchCovenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/covenants');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const items = d.covenants ?? [];
      setCovenants(items);
      const totalKas = items.reduce((sum, c) => sum + (c.amount_kaspa || 0), 0);
      setStats({
        total: d.grand_total ?? items.length,
        active: items.filter((c) => c.amount_kaspa > 0).length,
        totalKas,
      });
      setLiveStats((p) => ({
        bps: 10,
        tps: items.length,
        indexed: d.grand_total ?? items.length,
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCovenants();
    const t = setInterval(fetchCovenants, 30000);
    return () => clearInterval(t);
  }, [fetchCovenants]);

  const tiers = ['all', 'MAX', 'PRO', 'CREATOR', 'FREE'];
  const categories = ['all', ...new Set(covenants.map((c) => c.category).filter(Boolean))];

  let filtered = [...covenants];
  if (filter !== 'all') filtered = filtered.filter((c) => c.tier === filter);
  if (category !== 'all') filtered = filtered.filter((c) => c.category === category);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.tx_id || '').toLowerCase().includes(q)
    );
  }

  return (
    <div className="w-full">
      {/* Hero */}
      <section className="relative pt-32 pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto px-4"
        >
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white mb-4">
            Chain is the truth.
            <br />
            <span className="text-kaspa-green kaspa-glow-text">Covex is the window.</span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
            The most powerful window into Kaspa covenants with seamless non-custodial wallet
            connectivity. Index. Compile. Deploy. All on the BlockDAG.
          </p>

          {/* Live stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              [`${liveStats.bps} BPS`, 'Block Speed'],
              [`${liveStats.indexed}`, 'Indexed Covenants'],
              [stats.active.toString(), 'Active'],
              [`${stats.totalKas.toLocaleString()} KAS`, 'Total Locked'],
            ].map(([val, label]) => (
              <div
                key={label}
                className="glass-panel rounded-2xl px-4 py-5 text-center"
              >
                <p className="text-2xl font-bold text-white font-mono tabular-nums">{val}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Explorer */}
      <div className="max-w-6xl mx-auto px-4 pb-20">
        {/* Stats row */}
        <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white tracking-tight">Covenant Explorer</h2>
            <p className="text-sm text-gray-400 mt-1">
              {stats.total} total indexed · {stats.active} active · {filtered.length} showing
            </p>
          </div>
          <button
            onClick={fetchCovenants}
            disabled={loading}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
              loading
                ? 'bg-white/[0.04] text-gray-500 cursor-not-allowed'
                : 'bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/30 hover:bg-kaspa-green/20 active:scale-[0.97]'
            }`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scanning
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12a9 9 0 11-2.2-6" />
                  <path d="M21 3v6h-6" />
                </svg>
                Scan Node
              </>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search covenants by name, description, or TXID..."
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-kaspa-green/50 focus:ring-1 focus:ring-kaspa-green/20 transition-colors"
            />
          </div>
        </div>

        {/* Filters row 1: status + tiers */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {tiers.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                filter === t
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-300'
              }`}
            >
              {t === 'all'
                ? 'All Tiers'
                : t === 'CREATOR'
                ? `Creator (100 KAS)`
                : t === 'PRO'
                ? `PRO (500 KAS)`
                : t === 'MAX'
                ? `MAX (1000 KAS)`
                : t}
            </button>
          ))}
        </div>

        {/* Filters row 2: categories */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                category === cat
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-300'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {loading && covenants.length === 0 ? (
          <div className="glass-panel p-10 text-center space-y-4">
            <div className="animate-pulse text-kaspa-green font-mono text-sm tracking-widest">
              SCANNING KASPA BLOCKDAG...
            </div>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="h-16 w-16 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-panel px-10 py-16 text-center">
            <p className="text-gray-500 text-sm">No covenants found matching your filters.</p>
            <p className="text-gray-600 text-xs mt-1">
              Try adjusting your search criteria or scanning the node.
            </p>
          </div>
        ) : (
          <div className="glass-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Covenant', 'Category', 'Locked KAS', 'Tier', 'Action'].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filtered.map((c) => (
                    <tr key={c.tx_id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-8 w-8 rounded-lg border border-white/10 flex items-center justify-center"
                            style={{
                              background: `${(CATEGORY_COLORS[c.category] || '#49EACB')}10`,
                              borderColor: `${CATEGORY_COLORS[c.category] || '#49EACB'}30`,
                            }}
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke={CATEGORY_COLORS[c.category] || '#49EACB'} strokeWidth="2" strokeLinecap="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </div>
                          <div>
                            <Link
                              to={`/covenant/${c.tx_id}`}
                              className="text-kaspa-green font-mono text-xs hover:underline font-medium"
                            >
                              {c.name || TRUNC(c.tx_id)}
                            </Link>
                            {c.description && (
                              <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">
                                {c.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-white/5 text-gray-300 border border-white/10">
                          {c.category || 'General'}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm text-white tabular-nums">
                        {c.amount_kaspa?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${
                            TIER_COLORS[c.tier] || TIER_COLORS.FREE
                          }`}
                        >
                          {c.tier || 'FREE'}
                        </span>
                        {c.verified_tier && c.verified_tier !== 'FREE' && c.verified_tier !== 'EXPLORER' ? (
                          <span className="ml-1.5 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            VERIFIED
                          </span>
                        ) : (
                          <span className="ml-1.5 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            DANGER
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          to={`/covenant/${c.tx_id}`}
                          className="text-xs font-medium text-gray-400 hover:text-kaspa-green transition-colors"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-white/5 text-xs text-gray-600">
              {filtered.length} covenant{filtered.length !== 1 ? 's' : ''} shown
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
