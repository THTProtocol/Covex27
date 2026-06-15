import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Database, Search, Sparkles, Play,
  Coins, Layers, Crown, Star, Gamepad2, TrendingUp,
  ShieldCheck, Zap
} from 'lucide-react';
import { useWallet } from '../components/WalletContext';
import GamePreview, { detectGameType, hasCustomUI } from '../components/GamePreview';
import LiveTicker from '../components/LiveTicker';
import TrustBadge from '../components/TrustBadge';
import { Badge } from '../components/ui/Badge';

const formatKaspa = (kas) => {
  if (kas == null) return 'N/A';
  const num = Number(kas);
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M KAS`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K KAS`;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 2 })} KAS`;
};

const truncate = (s, n = 8) =>
  s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-4)}` : s || 'N/A';

const TIER_CONFIG = {
  MAX: {
    label: 'MAX',
    gradient: 'from-amber-500/20 via-amber-600/10 to-transparent',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    glow: 'shadow-[0_0_24px_rgba(245,158,11,0.12)]',
    rank: 4,
    icon: Crown,
  },
  PRO: {
    label: 'PRO',
    gradient: 'from-emerald-500/20 via-emerald-600/10 to-transparent',
    border: 'border-emerald-500/25',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    glow: 'shadow-[0_0_16px_rgba(16,185,129,0.10)]',
    rank: 3,
    icon: Star,
  },
  BUILDER: {
    label: 'BUILDER',
    gradient: 'from-blue-500/15 via-blue-600/8 to-transparent',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    glow: 'shadow-[0_0_8px_rgba(59,130,246,0.08)]',
    rank: 2,
    icon: ShieldCheck,
  },
  FREE: {
    label: 'FREE',
    gradient: 'from-white/5 to-transparent',
    border: 'border-white/8',
    text: 'text-gray-400',
    badge: 'bg-white/5 text-gray-500 border-white/10',
    glow: '',
    rank: 0,
    icon: Layers,
  },
};

const isSkillGame = (c) => {
  const t = (c.covenant_type || '').toLowerCase();
  return /chess|connect.?4|poker|blackjack|checkers|tic.?tac|reversi|rps|rock.?paper|skill.?game|game|tournament|flip/i.test(t);
};

// Server-side q terms per category (pipe-separated = OR). Keeps filters working
// now that the list is paginated instead of fully downloaded.
const CATEGORY_QUERY = {
  'Chess': 'chess', 'Poker': 'poker', 'Blackjack': 'blackjack',
  'Dice & VRF': 'dice|vrf', 'RPS & Games': 'rps|rock|reversi|tic',
  'Connect4': 'connect4|connect 4|connect-4',
  'ZK Proofs': 'zk|verifiable|range|merkle', 'ZK Oracle Tools': 'zk|oracle|range|merkle',
  'DeFi': 'defi|yield|compound', 'Yield & Compounding': 'yield|compound',
  'Privacy Mixers': 'privacy|mixer|nullifier', 'Auctions': 'auction',
  'Lotteries & Pots': 'lottery|pot', 'Community Pools': 'community|pool',
  'Timelocks': 'timelock', 'Milestone Escrows': 'milestone|escrow',
  'Membership Claims': 'claim|membership', 'Prediction Pools': 'predict|bet|market',
  'Predictive Markets': 'predict|market',
  'Games & Matches': 'chess|poker|connect|tic|rps|reversi|blackjack|game',
  'Skill': 'skill|chess|poker|game', 'Verifiable Skill': 'skill|chess|game',
  'Escrow & Custody': 'escrow|custody', 'Structured Settlement': 'structured|vesting|settlement',
  'Governance & DAO': 'governance|dao|voting', 'Tournaments': 'tournament|bracket',
  'Flash Covenants': 'flash', 'Multi-sig': 'multisig|multi-sig|multi sig',
  'Custom Logic': 'custom', 'General': 'general', 'Oracle': 'oracle',
  'P2SH Commitments': 'p2sh', 'Vesting & Timelocks': 'vesting|timelock',
  'Atomic Swaps': 'atomic|htlc|swap', 'Multi-sig Safes': 'multisig|multi-sig',
};

const PAGE_SIZE = 60;

const ALL_CATEGORIES = [
  'All',
  // Core types
  'Predictive Markets', 'Flash Covenants', 'Tournaments', 'Games & Matches',
  'Community Pools', 'ZK Oracle Tools', 'Escrow & Custody', 'Structured Settlement',
  'Governance & DAO', 'Skill', 'Verifiable Skill', 'DeFi', 'Oracle', 'ZK Proofs', 'General',
  // Specific games & mechanics (for granular filtering)
  'Chess', 'Poker', 'Blackjack', 'Dice & VRF', 'RPS & Games', 'Connect4', 'Reversi', 'Tic-Tac-Toe',
  // Advanced / specialized
  'Yield & Compounding', 'Auctions', 'Lotteries & Pots', 'Privacy Mixers', 'Timelocks',
  'Milestone Escrows', 'Membership Claims', 'Multi-sig', 'Prediction Pools', 'Custom Logic', 'P2SH Commitments', 'Vesting & Timelocks', 'Atomic Swaps', 'Multi-sig Safes'];

export default function Explorer() {
  const { address } = useWallet();
  const [covenants, setCovenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('explore');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [stats, setStats] = useState({ total: 0, paidCount: 0, totalTVL: 0 });
  const [showArena, setShowArena] = useState(false);
  const [includeRaw, setIncludeRaw] = useState(false);
  const [kaspaNetwork, setKaspaNetwork] = useState(() => localStorage.getItem('kaspaNetwork') || 'testnet-12');
  const [activeCategory, setActiveCategory] = useState('All');
  const [offset, setOffset] = useState(0);
  const [liveMatches, setLiveMatches] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      setKaspaNetwork(typeof e.detail === 'string' ? e.detail : localStorage.getItem('kaspaNetwork') || 'testnet-12');
    };
    window.addEventListener('kaspa-network-change', handler);
    return () => window.removeEventListener('kaspa-network-change', handler);
  }, []);

  const buildListUrl = useCallback((off) => {
    let url = `/api/covenants?network=${kaspaNetwork}&limit=${PAGE_SIZE}&offset=${off}`;
    const catQ = CATEGORY_QUERY[activeCategory];
    if (activeCategory !== 'All' && catQ) url += `&q=${encodeURIComponent(catQ)}`;
    // By default the backend curates to covenants with real metadata (paid tier / genuine
    // description) and hides bare opaque crawled P2SH commitments. "Show all" reveals them.
    if (includeRaw) url += '&include_raw=1';
    return url;
  }, [kaspaNetwork, activeCategory, includeRaw]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setOffset(0);
    fetch(buildListUrl(0))
      .then(res => res.json())
      .then(data => {
        const list = (Array.isArray(data.covenants) ? data.covenants : []);
        setCovenants(list);
        setHasMore((data.total || 0) > list.length);
        setStats(prev => ({
          ...prev,
          total: data.total || list.length,
          paidCount: data.stats?.paid ?? prev.paidCount,
          totalTVL: data.stats?.tvl_kas ?? prev.totalTVL,
        }));
        setLoading(false);
      })
      .catch(() => { setError('Could not load covenants'); setLoading(false); });
  }, [kaspaNetwork, activeCategory, buildListUrl]);

  // Live matchmaking: waiting matches from the persistent games API.
  useEffect(() => {
    let mounted = true;
    const load = () =>
      fetch('/api/games?status=waiting&limit=24')
        .then((r) => r.json())
        .then((d) => { if (mounted) setLiveMatches(Array.isArray(d.games) ? d.games : []); })
        .catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => { mounted = false; clearInterval(id); };
  }, [activeTab]);

  const loadMore = useCallback(() => {
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    fetch(buildListUrl(nextOffset))
      .then(r => r.json())
      .then(data => {
        const more = (Array.isArray(data.covenants) ? data.covenants : []);
        setCovenants(prev => {
          const seen = new Set(prev.map(c => c.tx_id));
          return [...prev, ...more.filter(c => !seen.has(c.tx_id))];
        });
        setOffset(nextOffset);
        setHasMore((data.total || 0) > nextOffset + more.length);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [offset, buildListUrl]);

  const handleSearch = useCallback((e) => {
    if (e?.preventDefault) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true); setSearchError(null); setSearchResults(null);
    const isTxId = q.includes(':');
    const isWalletAddr = q.startsWith('kaspatest:') || q.startsWith('kaspa:') || q.length >= 40;
    if (isTxId) {
      fetch(`/api/covenants/${encodeURIComponent(q)}`)
        .then(r => (r.ok ? r.json() : {}))
        .then(d => {
          setSearchResults({ type: 'covenant', data: d.covenant ? [d.covenant] : [] });
          if (!d.covenant) setSearchError(`No covenant found for TXID: ${q.slice(0, 16)}...`);
          setSearchLoading(false);
        })
        .catch(err => { setSearchError(`Search failed: ${err.message}`); setSearchLoading(false); });
    } else if (isWalletAddr) {
      fetch(`/api/covenants?network=${kaspaNetwork}&creator=${encodeURIComponent(q)}&limit=200`)
        .then(r => r.json())
        .then(d => {
          const matches = Array.isArray(d.covenants) ? d.covenants : [];
          setSearchResults({ type: 'wallet', query: q, data: matches });
          if (matches.length === 0) setSearchError(`No covenants found for wallet: ${q.slice(0, 20)}...`);
          setSearchLoading(false);
        })
        .catch(err => { setSearchError(`Search failed: ${err.message}`); setSearchLoading(false); });
    } else {
      // Keyword search across name, description and category
      fetch(`/api/covenants?network=${kaspaNetwork}&q=${encodeURIComponent(q)}&limit=100`)
        .then(r => r.json())
        .then(d => {
          const matches = Array.isArray(d.covenants) ? d.covenants : [];
          setSearchResults({ type: 'keyword', query: q, data: matches });
          if (matches.length === 0) setSearchError(`No covenants match "${q.slice(0, 30)}"`);
          setSearchLoading(false);
        })
        .catch(err => { setSearchError(`Search failed: ${err.message}`); setSearchLoading(false); });
    }
  }, [searchQuery, kaspaNetwork]);

  // MAIN SORT: MAX first, then PRO, then BUILDER, then FREE. Within each tier: highest TVL at top.
  const allCovenantsSorted = [...covenants].sort((a, b) => {
    const aTier = (a.verified_tier || a.tier || 'FREE').toUpperCase();
    const bTier = (b.verified_tier || b.tier || 'FREE').toUpperCase();
    const aRank = (TIER_CONFIG[aTier] || TIER_CONFIG.FREE).rank;
    const bRank = (TIER_CONFIG[bTier] || TIER_CONFIG.FREE).rank;
    if (bRank !== aRank) return bRank - aRank;
    return (b.amount_kaspa || 0) - (a.amount_kaspa || 0);
  });

  // Category filtering happens server-side (q terms); the loaded list is already filtered.
  const filteredCovenants = allCovenantsSorted;

  // ARENA: only skill games created on Covex where someone is waiting
  const arenaWaiting = covenants.filter(c => {
    const hasTx = c.tx_id && c.tx_id.length > 20;
    const isGame = isSkillGame(c);
    const isActive = c.is_active !== false;
    const participants = c.participant_count || 1;
    const isWaiting = participants < 2 && isActive;
    const hasStake = (c.amount_kaspa || 0) > 0;
    const isCovex = (c.verified_tier && c.verified_tier !== 'FREE') || (c.custom_ui_config && Object.keys(c.custom_ui_config).length > 0);
    return hasTx && isGame && isWaiting && hasStake && isCovex;
  });
  const arenaSorted = [...arenaWaiting].sort((a, b) => {
    const aRank = (TIER_CONFIG[(a.verified_tier || a.tier || 'FREE').toUpperCase()] || TIER_CONFIG.FREE).rank;
    const bRank = (TIER_CONFIG[(b.verified_tier || b.tier || 'FREE').toUpperCase()] || TIER_CONFIG.FREE).rank;
    if (bRank !== aRank) return bRank - aRank;
    return (b.amount_kaspa || 0) - (a.amount_kaspa || 0);
  });

  const netLabel = { 'testnet-12': 'TN12', 'testnet-10': 'TN10', 'mainnet': 'MAINNET' }[kaspaNetwork] || kaspaNetwork;

  return (
    <>
      {/* HERO */}
      <section className="relative z-10 flex flex-col items-center justify-center pt-16 sm:pt-20 pb-6 px-4 sm:px-6 text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-5 max-w-3xl leading-[1.15] animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_both]">
          Interactive Covenants for <span className="text-kaspa-green">The Kaspa BlockDAG</span>
        </h1>
        <p className="text-sm sm:text-base text-gray-200 max-w-xl mx-auto leading-relaxed mb-6 animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_0.07s_both]">
          Discover, deploy, and interact with SilverScript covenants. Programmable UTXOs at 10 blocks per second.
        </p>
        <div className="w-full max-w-2xl mx-auto rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_48px_-24px_rgba(73,234,203,0.3)] grid grid-cols-3 divide-x divide-white/[0.06] mb-3 overflow-hidden animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_0.14s_both]">
          {[
            { icon: Layers, label: `${netLabel} Covenants`, value: stats.total.toLocaleString() },
            { icon: TrendingUp, label: 'Paid Tiers', value: stats.paidCount },
            { icon: Coins, label: 'Total TVL', value: formatKaspa(stats.totalTVL) },
          ].map((s, i) => (
            <div key={i} className="flex flex-col items-center justify-center gap-1 py-4 px-2 hover:bg-white/[0.025] transition-colors">
              <p className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-gray-400 font-mono uppercase tracking-[0.18em]">
                <s.icon size={11} className="text-kaspa-green/80" />{s.label}
              </p>
              <p className="text-lg sm:text-xl font-black bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        <LiveTicker network={kaspaNetwork} />

        {/* Category filter: single button that reveals all types/options when pressed (clean, not always listing everything) */}
        <div className="flex justify-center mb-4">
          <button
            onClick={() => setShowCategoryPanel(!showCategoryPanel)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm text-white/80 hover:text-white hover:border-white/20 transition-all"
          >
            <Layers size={16} className="text-kaspa-green" />
            {activeCategory === 'All' ? 'All Covenant Types' : activeCategory}
            <span className="text-xs opacity-60">▼</span>
          </button>
        </div>

        {showCategoryPanel && (
          <div className="max-w-4xl mx-auto mb-6 p-4 rounded-2xl glass-panel border border-white/10">
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-3 text-center">Filter by Covenant Type - click any to apply</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 text-xs">
              {ALL_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); setShowCategoryPanel(false); }}
                  className={`px-3 py-2 rounded-xl border text-left transition-all ${activeCategory === cat ? 'bg-kaspa-green/10 border-kaspa-green/40 text-kaspa-green font-semibold' : 'border-white/10 bg-white/[0.015] text-white/70 hover:text-white hover:border-white/20 hover:bg-white/5'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="text-center mt-3">
              <button onClick={() => { setActiveCategory('All'); setShowCategoryPanel(false); }} className="text-[10px] text-white/50 hover:text-white underline">Clear / Show All Types</button>
            </div>
          </div>
        )}
      </section>

      {/* CONTROLS - Explore / Search / Arena */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-white/[0.03] border border-white/5 p-0.5">
            {[
              { id: 'explore', icon: Database, label: 'All Covenants' },
              { id: 'search', icon: Search, label: 'Search' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSearchResults(null); setSearchError(null); setSearchQuery(''); setShowArena(false); }}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === tab.id && !showArena ? 'bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/20' : 'text-gray-300 hover:text-white'
                }`}
              >
                <tab.icon size={12} /><span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { setShowArena(!showArena); setActiveTab('explore'); }}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              showArena ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'text-gray-300 hover:text-amber-400 border border-transparent hover:border-amber-500/20'
            }`}
          >
            <Gamepad2 size={12} />
            <span className="hidden sm:inline">Arena</span>
            {arenaWaiting.length > 0 && (
              <span className={`text-[9px] px-1.5 rounded-full ${showArena ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-500/10 text-amber-400'}`}>
                {arenaWaiting.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="relative z-10 px-4 sm:px-6 pb-8 max-w-6xl mx-auto">

        {/* SEARCH TAB */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <form onSubmit={handleSearch} className="relative">
              <div className="relative flex items-center gap-3 p-3 sm:p-4 rounded-2xl glass-panel focus-within:border-kaspa-green/40 transition-all">
                <Search size={18} className="text-kaspa-green shrink-0" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="kaspatest:qr... or covenant txid (hash:0)"
                  className="flex-1 bg-transparent border-none outline-none text-sm font-mono text-white placeholder:text-gray-200"
                  autoFocus spellCheck={false} autoComplete="off"
                />
                <button type="submit" disabled={searchLoading || !searchQuery.trim()}
                  className="px-4 py-2 rounded-xl bg-kaspa-green text-black font-bold text-xs hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                >
                  {searchLoading ? <span className="inline-block w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <><Search size={12} /> Search</>}
                </button>
              </div>
            </form>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-gray-200">
              <span>Try:</span>
              <button onClick={() => setSearchQuery('kaspatest:')} className="px-2 py-0.5 rounded border border-white/5 hover:border-kaspa-green/20 hover:text-kaspa-green transition-colors font-mono">kaspatest:...</button>
              <button onClick={() => setSearchQuery(':')} className="px-2 py-0.5 rounded border border-white/5 hover:border-kaspa-green/20 hover:text-kaspa-green transition-colors font-mono">txid:0</button>
            </div>
            {searchLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
                <div className="w-8 h-8 border-2 border-kaspa-green/30 border-t-kaspa-green rounded-full animate-spin" />
                <p className="text-sm font-mono">Querying BlockDAG...</p>
              </div>
            )}
            {searchError && !searchLoading && (
              <div className="p-6 rounded-2xl bg-red-500/[0.04] border border-red-500/20 text-center">
                <p className="text-sm text-red-400 font-mono mb-1">No Results</p>
                <p className="text-xs text-gray-300">{searchError}</p>
              </div>
            )}
            {searchResults && !searchLoading && searchResults.data.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-kaspa-green">
                    {searchResults.type === 'wallet' ? `Found ${searchResults.data.length} covenant${searchResults.data.length !== 1 ? 's' : ''}` : 'Found covenant'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {searchResults.data.map((c, i) => (
                    <CovenantCard key={c.tx_id || i} covenant={c} index={i} ownerAddress={address} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ARENA VIEW */}
        {showArena && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-black text-white tracking-tight">
                <span className="text-amber-400">Arena</span> - Open Matches
              </h2>
              <span className="text-xs text-amber-400/60 font-mono">
                Skill games with someone waiting to match. Covex-created only.
              </span>
            </div>
            {liveMatches.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Opponent waiting - join now
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveMatches.map((m) => (
                    <Link
                      key={m.covenant_id}
                      to={`/covenant/${encodeURIComponent(m.covenant_id)}?play=1`}
                      className="glass-panel rounded-2xl p-4 border border-emerald-500/25 hover:border-emerald-400/60 transition-all hover:-translate-y-0.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white capitalize">{m.game_type} match</p>
                        <p className="text-[10px] font-mono text-gray-500 truncate">{m.covenant_id.slice(0, 22)}...</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">White seat taken. Join as black.</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-black text-emerald-300">{m.pot_amount_kas || 0} KAS</p>
                        <span className="inline-block mt-1 px-2.5 py-1 rounded-lg bg-emerald-500 text-black text-[10px] font-extrabold">JOIN</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-3">
                <div className="w-10 h-10 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
                <p className="text-sm font-mono">Scanning for active matches...</p>
              </div>
            ) : arenaSorted.length === 0 && liveMatches.length === 0 ? (
              <div className="text-center py-12 glass-panel rounded-2xl text-gray-400 text-sm">
                <Gamepad2 size={32} className="mx-auto mb-3 text-amber-400/30" />
                <p className="text-base text-amber-400/70 mb-2">No active matches right now</p>
                <p className="text-xs">When a game creator is waiting for an opponent, their match appears here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {arenaSorted.map((g, i) => {
                  const tierKey = (g.verified_tier || g.tier || 'FREE').toUpperCase();
                  const cfg = TIER_CONFIG[tierKey] || TIER_CONFIG.FREE;
                  const stakeAmt = g.amount_kaspa || 1;
                  return (
                    <div key={g.tx_id || i} className={`glass-panel rounded-3xl p-5 border transition-all ${cfg.border} bg-gradient-to-br ${cfg.gradient} ${cfg.glow} min-h-[210px] flex flex-col`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className={`text-xs font-bold tracking-[2px] ${cfg.text}`}>{(g.covenant_type || g.name || 'Game').toUpperCase()}</div>
                          <div className="text-lg font-bold text-white mt-1 truncate">{g.name || g.covenant_type || 'Unknown'}</div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className={`text-xs ${cfg.text} font-mono`}>{g.participant_count || 1} / 2</div>
                          <div className="font-mono text-lg text-white font-bold">{formatKaspa(stakeAmt)}</div>
                          {cfg.rank > 1 && <span className={`text-[9px] mt-1 px-1.5 py-0.5 rounded ${cfg.badge} inline-block font-mono`}>{cfg.label}</span>}
                        </div>
                      </div>
                      <div className="text-xs text-gray-300 mb-4 flex-1">Match the stake to join. On-chain covenant with transparent resolution.</div>
                      <Link
                        to={`/covenant/${encodeURIComponent(g.tx_id)}`}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-2xl text-sm active:scale-[0.985] shadow flex items-center justify-center gap-2 transition-all"
                      >
                        <Play size={14} /> JOIN BY STAKING ({formatKaspa(stakeAmt)})
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* EXPLORE TAB - all covenants, premium at top */}
        {activeTab === 'explore' && !showArena && (
          <>
            {loading && (
              <div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-3">
                <div className="w-10 h-10 border-2 border-kaspa-green/20 border-t-kaspa-green rounded-full animate-spin" />
                <p className="text-sm font-mono">Loading from the BlockDAG...</p>
              </div>
            )}
            {error && <p className="text-red-500 text-center py-10">{error}</p>}
            {!loading && covenants.length === 0 && (
              <div className="glass-panel rounded-2xl p-10 text-center">
                <Layers size={40} className="mx-auto text-gray-200 mb-3" />
                {kaspaNetwork === 'mainnet' ? (
                  <>
                    <p className="text-lg font-semibold text-white mb-1">No covenants on mainnet yet</p>
                    <p className="text-sm text-gray-300 max-w-md mx-auto">
                      SilverScript covenants activate on Kaspa mainnet with the Toccata hard fork (June 2026 window). Covex runs a live mainnet node and indexes in real time; the first real covenant appears here the moment it lands. Covenants are live now on Toccata TN12.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-white mb-1">No covenants detected yet</p>
                    <p className="text-sm text-gray-300">The Kaspa node is still syncing. Covenants will appear automatically.</p>
                  </>
                )}
              </div>
            )}
            {!loading && covenants.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-kaspa-green flex items-center gap-1.5">
                      <Layers size={12} />{includeRaw ? 'All Commitments' : 'Covenants'}
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono">{stats.total.toLocaleString()} {includeRaw ? 'total - PAID at top' : 'curated - PAID at top'}</span>
                  </div>
                  <button
                    onClick={() => setIncludeRaw(v => !v)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${includeRaw ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green' : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}
                    title="Bare P2SH commitments are opaque until spend; curated view hides them"
                  >
                    {includeRaw ? 'Showing all on-chain commitments' : 'Show all on-chain commitments'}
                  </button>
                </div>
                {filteredCovenants.length === 0 ? (
                  <div className="glass-panel rounded-2xl py-14 text-center">
                    <p className="text-gray-300 text-sm font-semibold mb-1">No covenants match this filter yet</p>
                    <p className="text-gray-500 text-xs">Try another category or check back soon. New covenants are indexed within seconds.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                    {filteredCovenants.map((c, i) => (
                      <CovenantCard key={c.tx_id || i} covenant={c} index={i} ownerAddress={address} />
                    ))}
                  </div>
                )}
                {hasMore && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="px-6 py-2.5 rounded-xl border border-kaspa-green/40 text-kaspa-green text-sm font-bold hover:bg-kaspa-green/10 transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? 'Loading...' : `Load more (${stats.total.toLocaleString()} total)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* PREMIUM COVENANT CARD - rich data, all info, premium visuals */
function CovenantCard({ covenant: c, index, ownerAddress }) {
  const tierKey = (c.verified_tier || c.tier || 'FREE').toUpperCase();
  const cfg = TIER_CONFIG[tierKey] || TIER_CONFIG.FREE;
  const IconComponent = cfg.icon;
  const isPaid = cfg.rank > 0;
  const gameType = detectGameType(c);
  const customUI = hasCustomUI(c);
  const isActive = c.is_active !== false;
  const creatorName = c.creator_addr || c.address || '';
  const blockDAA = c.block_daa_score || 0;
  const scriptShort = (c.script_hash || '').slice(0, 8);
  const categoryLabel = c.category || 'general';
  const txShort = (c.tx_id || '').slice(0, 10);
  const timestamp = c.timestamp ? new Date(c.timestamp * 1000).toLocaleDateString() : (c.block_daa_score ? `DAA ${blockDAA.toLocaleString()}` : 'Unknown');
  const statusColor = isActive ? 'text-emerald-400' : 'text-gray-500';
  const statusLabel = isActive ? 'ACTIVE' : 'SETTLED';

  let paidMetadata = null;
  try {
    const meta = c.custom_ui_config;
    if (meta && typeof meta === 'object' && meta.paid_token_hash) paidMetadata = meta;
    else if (meta && typeof meta === 'string') { const p = JSON.parse(meta); if (p.paid_token_hash) paidMetadata = p; }
  } catch (_) {}

  const covenantName = paidMetadata?.name || c.name || c.covenant_type || 'Unnamed Covenant';
  const covenantDesc = paidMetadata?.description || c.description || c.full_logic_summary || 'On-chain Kaspa covenant. Transparent, verifiable, non-custodial.';
  const themeAccent = paidMetadata?.theme?.accent || '#49EACB';
  const disclosedWallets = paidMetadata?.disclosed_wallets;
  const isPaidVerified = !!paidMetadata;
  const amount = c.amount_kaspa || 0;

  // Visual category detection
  const catColors = {
    'games': 'from-purple-500/30 via-purple-600/10 to-transparent',
    'game': 'from-purple-500/30 via-purple-600/10 to-transparent',
    'general': 'from-gray-500/20 via-gray-600/10 to-transparent',
    'oracle': 'from-cyan-500/30 via-cyan-600/10 to-transparent',
    'predictive': 'from-pink-500/30 via-pink-600/10 to-transparent',
    'escrow': 'from-blue-500/30 via-blue-600/10 to-transparent',
    'tournament': 'from-emerald-500/30 via-emerald-600/10 to-transparent',
    'structured': 'from-teal-500/30 via-teal-600/10 to-transparent',
    'community': 'from-orange-500/30 via-orange-600/10 to-transparent',
    'flash': 'from-yellow-500/30 via-yellow-600/10 to-transparent',
    'governance': 'from-red-500/30 via-red-600/10 to-transparent',
    'p2sh': 'from-slate-500/30 via-slate-600/10 to-transparent',
    'vesting': 'from-indigo-500/30 via-indigo-600/10 to-transparent',
    'atomic': 'from-rose-500/30 via-rose-600/10 to-transparent',
    'multisig': 'from-lime-500/30 via-lime-600/10 to-transparent',
  };
  const catGradient = catColors[categoryLabel.toLowerCase()] || catColors.general;

  return (
    <Link to={`/covenant/${encodeURIComponent(c.tx_id)}`}
      className={`group block rounded-2xl border transition-all duration-300 overflow-hidden hover:-translate-y-0.5 ${
        isPaid ? `${cfg.border} ${cfg.glow} hover:shadow-xl` : 'border-white/10 hover:border-[#49EACB]/25 hover:shadow-lg hover:shadow-[#49EACB]/[0.06]'
      } bg-gradient-to-b from-[#13131c] to-[#0a0a0e] min-h-[300px] flex flex-col`}
    >
      {/* VISUAL HEADER - tier + category gradient stripe */}
      <div className="relative h-16 overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-r ${cfg.gradient}`} />
        <div className={`absolute inset-0 bg-gradient-to-r ${catGradient} opacity-60`} />
        {/* Decorative dots pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '16px 16px'
        }} />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0c0c12] to-transparent" />
        <div className="absolute top-2 left-3 flex items-center gap-2">
          {isPaid && (
            <span className={`text-[9px] px-2 py-0.5 rounded-full border ${cfg.badge} font-mono font-bold flex items-center gap-1 backdrop-blur-sm`}>
              <IconComponent size={10} />{cfg.label}
            </span>
          )}
          {isPaidVerified && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono backdrop-blur-sm">
              VERIFIED
            </span>
          )}
        </div>
        <div className="absolute bottom-1 right-3 text-[10px] font-mono text-white/60">
          {categoryLabel}
        </div>
        <div className="absolute bottom-2 left-3">
          <TrustBadge covenant={c} size="sm" />
        </div>
      </div>

      <div className="p-4 sm:p-5 flex flex-col flex-1">
        {/* Name + Status + Amount */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className={`font-bold text-sm sm:text-base truncate ${isPaid ? cfg.text : 'text-gray-200'}`}
              style={isPaidVerified ? { color: themeAccent } : undefined}>
              {covenantName}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono text-gray-500">{txShort}...</span>
              <span className={`text-[9px] font-mono font-bold ${statusColor}`}>{statusLabel}</span>
            </div>
          </div>
          <div className="text-right shrink-0 ml-2">
            <div className="font-mono text-base font-bold text-white">{formatKaspa(amount)}</div>
            {isPaid && (
              <div className={`text-[10px] font-mono mt-0.5 ${cfg.text}`}>{cfg.label} TIER</div>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-gray-400 mb-4 leading-relaxed line-clamp-2 flex-1">
          {covenantDesc}
        </p>

        {/* Game preview + Custom UI badges */}
        {(gameType || customUI) && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {gameType && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-kaspa-green/10 border border-kaspa-green/20 text-kaspa-green uppercase tracking-wider">
                <Play size={9} />{gameType}
              </span>
            )}
            {customUI && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300">
                <Sparkles size={9} />Custom UI
              </span>
            )}
          </div>
        )}

        {/* Disclosed wallets for verified */}
        {isPaidVerified && Array.isArray(disclosedWallets) && disclosedWallets.length > 0 && (
          <div className="mb-3 rounded-lg bg-emerald-500/[0.03] border border-emerald-500/15 p-2">
            <div className="text-[9px] text-emerald-400 font-mono uppercase tracking-wide mb-1">Wallets Disclosed</div>
            <div className="flex flex-wrap gap-1">
              {disclosedWallets.slice(0, 3).map((w, i) => (
                <span key={i} className="text-[8px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded font-mono">{w.role}</span>
              ))}
            </div>
          </div>
        )}

        {/* Footer - quiet provenance on the left, the action on the right */}
        <div className="mt-auto pt-3.5 border-t border-white/5 flex items-center justify-between gap-2 text-[10px] font-mono">
          <span className="text-gray-500 truncate">
            <span className="text-gray-400">{creatorName.slice(0, 10)}…</span>
            <span className="mx-1.5 text-white/15">·</span>
            {timestamp}
          </span>
          <span className={`shrink-0 inline-flex items-center gap-1 font-semibold ${isPaid ? cfg.text : 'text-kaspa-green/90'} group-hover:gap-1.5 transition-all`}>
            View <span className="group-hover:translate-x-0.5 transition-transform">{'→'}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
