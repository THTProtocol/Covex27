import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Database, Search, Sparkles, Play,
  Coins, Layers, Crown, Star, Gamepad2, TrendingUp,
  ShieldCheck, Zap,
  Radio, Trophy, Users, Landmark, Lock, Clock, Repeat, KeyRound, Boxes
} from 'lucide-react';

// Distinct icon per covenant category so cards are scannable at a glance (not all the same glyph).
const CATEGORY_ICON = {
  game: Gamepad2, games: Gamepad2,
  oracle: Radio,
  predictive: TrendingUp, prediction: TrendingUp,
  escrow: ShieldCheck,
  tournament: Trophy,
  structured: Layers,
  community: Users,
  flash: Zap,
  governance: Landmark,
  p2sh: Lock,
  vesting: Clock,
  atomic: Repeat,
  multisig: KeyRound,
  general: Boxes,
};
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
  'Nullifier / Unlinkable': 'privacy|mixer|nullifier', 'Auctions': 'auction',
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
  'Yield & Compounding', 'Auctions', 'Lotteries & Pots', 'Nullifier / Unlinkable', 'Timelocks',
  'Milestone Escrows', 'Membership Claims', 'Multi-sig', 'Prediction Pools', 'Custom Logic', 'P2SH Commitments', 'Vesting & Timelocks', 'Atomic Swaps', 'Multi-sig Safes'];

// Animate a stat from 0 up to its REAL value once, the first time it loads (easeOutCubic).
// Honest: it always lands on the real indexed number. Reduced-motion users (and live +1
// increments after the first load) see the value snap, not re-animate. A setTimeout guard
// guarantees the final value even if requestAnimationFrame is throttled (background tabs).
function useCountUp(target, duration = 950) {
  const [val, setVal] = useState(0);
  const animated = useRef(false);
  useEffect(() => {
    const t = Number(target) || 0;
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animated.current || reduce || !t) { setVal(t); if (t) animated.current = true; return; }
    animated.current = true;
    let raf = 0, start = 0, done = false;
    const finish = () => { if (!done) { done = true; setVal(t); } };
    const tick = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setVal(t * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick); else finish();
    };
    raf = requestAnimationFrame(tick);
    const guard = setTimeout(finish, duration + 500);
    return () => { cancelAnimationFrame(raf); clearTimeout(guard); };
  }, [target, duration]);
  return val;
}

function CountUpStat({ icon: Icon, label, value, fmt }) {
  const n = useCountUp(value);
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-4 px-2 hover:bg-white/[0.025] transition-colors">
      <p className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-gray-400 font-mono uppercase tracking-[0.18em]">
        <Icon size={11} className="text-kaspa-green/80" />{label}
      </p>
      <p className="text-lg sm:text-xl font-black bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent tabular-nums">{fmt(n)}</p>
    </div>
  );
}

// Lightweight load-time entrance: each card fades + rises 12px, staggered. Drop-in layer
// around the grid only - it never touches card internals, so the CovenantCard hover-lift
// still works. Disabled under prefers-reduced-motion.
const GRID_STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const CARD_RISE = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] } } };

export default function Explorer() {
  const { address } = useWallet();
  const prefersReduced = useReducedMotion();
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
  // Default to showing ALL on-chain commitments (the full, thriving count). Covenants are honestly
  // LABELED now (no fabricated types), so there's no reason to hide them — "Verified only" is an
  // opt-in filter for users who want just paid + real-description covenants.
  const [includeRaw, setIncludeRaw] = useState(true);
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

  // Realtime: new covenants stream in over the websocket as the chain is indexed. Prepend them to
  // the top of the grid and bump the live count, so the explorer updates without a page refresh.
  useEffect(() => {
    if (activeCategory !== 'All') return; // only live-stream in the default browse view
    let ws; let mounted = true;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const d = msg?.data;
          if (!mounted || !d || d.event_type !== 'covenant_discovered') return;
          if (d.network && d.network !== kaspaNetwork) return;
          const cov = {
            tx_id: d.covenant_id,
            covenant_type: d.detail || 'p2sh-commitment',
            category: 'P2SH Commitments',
            amount_kaspa: d.amount_kaspa || 0,
            network: d.network || kaspaNetwork,
            verified_tier: 'EXPLORER',
            timestamp: d.timestamp || Math.floor(Date.now() / 1000),
            description: '',
            _isNew: true,
          };
          setCovenants((prev) => {
            if (!cov.tx_id || prev.some((c) => c.tx_id === cov.tx_id)) return prev;
            return [cov, ...prev].slice(0, 240);
          });
          setStats((prev) => ({ ...prev, total: (prev.total || 0) + 1 }));
        } catch { /* ignore non-JSON frames */ }
      };
    } catch { /* ws unavailable; the page-load fetch still shows recent covenants */ }
    return () => { mounted = false; try { ws && ws.close(); } catch {} };
  }, [kaspaNetwork, activeCategory]);

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
    // A Kaspa address carries a ':' in its prefix (kaspatest:/kaspa:), so detect the
    // address FIRST; only a non-address string with a ':' is a covenant txid (hash:index).
    const isWalletAddr = q.startsWith('kaspatest:') || q.startsWith('kaspa:');
    const isTxId = !isWalletAddr && q.includes(':');
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
        <div className="covex-aurora" style={{ top: 8, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 560, height: 300, maxWidth: '88vw' }} aria-hidden="true" />
        <h1 className="relative text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-5 max-w-3xl leading-[1.15] animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_both]">
          Interactive Covenants for <span className="text-kaspa-green">The Kaspa BlockDAG</span>
        </h1>
        <p className="text-sm sm:text-base text-gray-200 max-w-xl mx-auto leading-relaxed mb-6 animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_0.07s_both]">
          Discover, deploy, and interact with SilverScript covenants. Programmable UTXOs at 10 blocks per second.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-7 animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_0.1s_both]">
          <Link
            to="/sandbox"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-kaspa-green text-black font-bold text-sm shadow-[0_10px_34px_-10px_rgba(73,234,203,0.65)] hover:shadow-[0_14px_44px_-8px_rgba(73,234,203,0.85)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
          >
            <Sparkles size={16} className="transition-transform duration-300 group-hover:rotate-12" />
            Build a Covenant
          </Link>
          {/* Secondary hero CTA: the consensus-enforced primitives (hashlock, timelocks, HTLC,
              channel, dead-man, multisig) stay one click from home, but as a ghost button so
              "Build a Covenant" is the single primary. The subtle emerald accent keeps the
              on-chain enforcement reality legible without competing with the primary. */}
          <Link
            to="/deploy/enforced"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/15 bg-white/[0.03] text-emerald-300/90 font-semibold text-sm hover:border-emerald-400/50 hover:bg-emerald-500/[0.08] hover:text-emerald-200 transition-all duration-300"
          >
            <ShieldCheck size={16} className="text-emerald-400/90 transition-transform duration-300 group-hover:scale-110" />
            Deploy on-chain enforced
          </Link>
          <Link
            to="/readme"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/15 bg-white/[0.03] text-white/90 font-semibold text-sm hover:border-kaspa-green/40 hover:bg-white/[0.06] hover:text-white transition-all duration-300"
          >
            How It Works
          </Link>
        </div>
        <div className="hover-lift w-full max-w-2xl mx-auto rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_48px_-24px_rgba(73,234,203,0.3)] grid grid-cols-3 divide-x divide-white/[0.06] mb-3 overflow-hidden animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_0.14s_both]">
          {[
            { icon: Layers, label: `${netLabel} Covenants`, value: stats.total, fmt: (n) => Math.round(n).toLocaleString() },
            { icon: TrendingUp, label: 'Paid Tiers', value: stats.paidCount, fmt: (n) => Math.round(n).toLocaleString() },
            { icon: Coins, label: 'Total TVL', value: stats.totalTVL, fmt: (n) => formatKaspa(n) },
          ].map((s, i) => (
            <CountUpStat key={i} icon={s.icon} label={s.label} value={s.value} fmt={s.fmt} />
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
                  className="btn-shimmer px-4 py-2 rounded-xl bg-kaspa-green text-black font-bold text-xs hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton rounded-3xl min-h-[210px]" />
                ))}
              </div>
            ) : arenaSorted.length === 0 && liveMatches.length === 0 ? (
              <div className="relative glass-panel rounded-2xl p-10 text-center overflow-hidden">
                <div className="covex-aurora" aria-hidden="true" style={{ top: -20, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 380, height: 200, maxWidth: '90vw', opacity: 0.5 }} />
                <div className="relative z-10">
                  <span className="grid place-items-center mx-auto mb-4 h-14 w-14 rounded-2xl border border-amber-500/30 bg-amber-500/10">
                    <Gamepad2 size={28} className="text-amber-400" />
                  </span>
                  <p className="text-lg font-semibold text-white mb-1">No active matches right now</p>
                  <p className="text-sm text-gray-300 max-w-md mx-auto">When a game creator is waiting for an opponent, their match appears here.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {arenaSorted.map((g, i) => {
                  const tierKey = (g.verified_tier || g.tier || 'FREE').toUpperCase();
                  const cfg = TIER_CONFIG[tierKey] || TIER_CONFIG.FREE;
                  const stakeAmt = g.amount_kaspa || 1;
                  return (
                    <div key={g.tx_id || i} className={`hover-lift relative overflow-hidden glass-panel rounded-3xl p-5 border transition-all ${cfg.border} bg-gradient-to-br ${cfg.gradient} ${cfg.glow} min-h-[210px] flex flex-col`}>
                      <div
                        aria-hidden="true"
                        className="absolute top-0 inset-x-0 h-[3px]"
                        style={{ background: 'linear-gradient(90deg, transparent, #E8AF34, transparent)' }}
                      />
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
                        className="btn-shimmer w-full py-3 bg-kaspa-green hover:brightness-110 text-black font-extrabold rounded-2xl text-sm active:scale-[0.985] flex items-center justify-center gap-2 transition-all shadow-[0_0_0_1px_rgba(73,234,203,0.35),0_10px_30px_-10px_rgba(73,234,203,0.5)] hover:shadow-[0_0_28px_rgba(73,234,203,0.45)]"
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
                      SilverScript covenants activate on Kaspa mainnet with the Toccata hard fork on 30 June 2026. Covex has its mainnet indexer armed behind the honesty gate, with a mainnet node being synced ahead of launch; the first real covenant appears here the moment it lands, with no placeholder data before then.
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
                      <Layers size={12} />{includeRaw ? 'All Covenants' : 'Verified Covenants'}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-500 font-mono">
                      <span className="relative flex h-1.5 w-1.5" title="Live - updates as new covenants are indexed">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-kaspa-green opacity-60 animate-ping" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-kaspa-green" />
                      </span>
                      {stats.total.toLocaleString()} {includeRaw ? 'live - PAID at top' : 'verified - PAID at top'}
                    </span>
                  </div>
                  <button
                    onClick={() => setIncludeRaw(v => !v)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${!includeRaw ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green' : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}
                    title="Verified = paid tiers + covenants with a real description. All = every on-chain P2SH commitment (opaque until spend)."
                  >
                    {includeRaw ? 'Verified only' : 'Showing verified - show all'}
                  </button>
                </div>
                {filteredCovenants.length === 0 ? (
                  <div className="glass-panel rounded-2xl py-14 text-center">
                    <p className="text-gray-300 text-sm font-semibold mb-1">No covenants match this filter yet</p>
                    <p className="text-gray-500 text-xs">Try another category or check back soon. New covenants are indexed within seconds.</p>
                  </div>
                ) : (
                  <motion.div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
                    variants={prefersReduced ? undefined : GRID_STAGGER}
                    initial={prefersReduced ? false : 'hidden'}
                    animate={prefersReduced ? false : 'show'}
                  >
                    {filteredCovenants.map((c, i) => (
                      <motion.div key={c.tx_id || i} variants={prefersReduced ? undefined : CARD_RISE}>
                        <CovenantCard covenant={c} index={i} ownerAddress={address} />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
                {hasMore && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="btn-shimmer px-6 py-2.5 rounded-xl border border-kaspa-green/40 text-kaspa-green text-sm font-bold hover:bg-kaspa-green/10 transition-colors disabled:opacity-50"
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
  // Honest finality signal from the backend (derived against the live node tip). Only the
  // not-yet-final states get a chip; "final" is the boring default and stays uncluttered.
  const finality = (c.finality || '').toLowerCase();
  const finEtaMin = c.finality_eta_secs ? Math.max(1, Math.round(c.finality_eta_secs / 60)) : null;
  const showFinalityChip = finality === 'confirming' || finality === 'pending';

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

  // Deterministic per-card hue from the tx_id, so the FREE-tier wall reads as a varied
  // marketplace with rhythm instead of an identical gray sea (paid tiers keep their own
  // accent). Stable across renders (no Math.random), seeded purely by on-chain identity.
  const hueSeed = (() => {
    const s = c.tx_id || c.script_hash || covenantName || '';
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 360;
  })();
  const cardAccent = `hsl(${hueSeed} 72% 62%)`;
  // alpha variants of the identity hue (hsl with /alpha is valid at any opacity)
  const accA = (a) => `hsl(${hueSeed} 74% 60% / ${a})`;

  return (
    <Link to={`/covenant/${encodeURIComponent(c.tx_id)}`}
      className={`group relative flex flex-col rounded-2xl border overflow-hidden transition-all duration-300 will-change-transform hover:-translate-y-1 ${
        isPaid
          ? `${cfg.border} ${cfg.glow} holo-border hover:shadow-2xl`
          : 'border-white/[0.08] light:border-slate-200 hover:border-[color:var(--ca)] hover:shadow-[0_22px_55px_-22px_var(--cg)]'
      } bg-gradient-to-br from-[#15151f] via-[#0e0e16] to-[#0a0a0f] light:from-white light:via-white light:to-slate-50 min-h-[296px]`}
      style={!isPaid ? { '--ca': accA(0.55), '--cg': accA(0.4) } : undefined}
    >
      {/* Top accent bar - on-chain identity hue */}
      <div className="h-[3px] w-full shrink-0" aria-hidden="true"
        style={{ background: `linear-gradient(90deg, transparent, ${cardAccent}, transparent)`, opacity: isPaid ? 0.4 : 0.8 }} />

      {/* HEADER - category gradient + identity glow; badges left, category right, one clean row */}
      <div className="relative h-12 shrink-0 overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-r ${cfg.gradient}`} />
        <div className={`absolute inset-0 bg-gradient-to-r ${catGradient} opacity-50`} />
        {!isPaid && (
          <div className="absolute inset-0" aria-hidden="true"
            style={{ background: `radial-gradient(130% 110% at 0% 0%, ${accA(0.16)} 0%, transparent 60%)` }} />
        )}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '14px 14px',
        }} />
        <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[#0d0d14] light:from-white to-transparent" />
        <div className="relative z-10 flex items-center justify-between h-full px-3.5 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {c._isNew && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-kaspa-green/25 text-kaspa-green border border-kaspa-green/40 font-mono font-bold animate-pulse">NEW</span>
            )}
            {isPaid && (
              <span className={`text-[9px] px-2 py-0.5 rounded-md border ${cfg.badge} font-mono font-bold inline-flex items-center gap-1`}>
                <IconComponent size={10} />{cfg.label}
              </span>
            )}
            {isPaidVerified && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-bold">VERIFIED</span>
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-white/70 light:text-slate-500 truncate max-w-[58%]">
            {(() => { const CI = CATEGORY_ICON[categoryLabel.toLowerCase()] || Boxes; return <CI size={11} className="opacity-80 shrink-0" />; })()}
            <span className="truncate">{categoryLabel}</span>
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-[18px] flex flex-col flex-1">
        {/* Title + on-chain id */}
        <h3 className={`font-bold text-[15px] sm:text-base leading-tight truncate ${isPaid ? cfg.text : 'text-white light:text-slate-900'}`}
          style={isPaidVerified ? { color: themeAccent } : undefined}>
          {covenantName}
        </h3>
        <div className="mt-0.5 text-[10px] font-mono text-gray-500 light:text-slate-400 truncate">{txShort}...</div>

        {/* Value-locked hero + live status (the pot - leads like a gambling card) */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[8.5px] uppercase tracking-[0.16em] text-gray-500 light:text-slate-400 font-bold mb-1">Value Locked</div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[22px] sm:text-2xl font-black leading-none tracking-tight text-white light:text-slate-900"
                style={!isPaid ? { textShadow: `0 0 22px ${accA(0.32)}` } : undefined}>
                {formatKaspa(amount).replace(/\s*KAS$/i, '')}
              </span>
              <span className="text-[11px] font-bold text-gray-400 light:text-slate-500">KAS</span>
            </div>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide border ${isActive ? 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25' : 'bg-white/[0.04] text-gray-400 border-white/10'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
            {statusLabel}
          </span>
        </div>

        {/* Description - hard-clamped to exactly 2 lines with a clean ellipsis (inline styles so the
            webkit-box clamp always wins over flex-1, which previously defeated line-clamp and let the
            text spill and cut mid-sentence). break-words stops a long hash/word from overflowing. */}
        <p
          className="mt-3 text-xs text-gray-400 light:text-slate-500 leading-relaxed break-words"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {covenantDesc}
        </p>

        {/* Enforcement reality - the trust signal (moved out of the header into a clean row) */}
        <div className="mt-3">
          <TrustBadge covenant={c} size="sm" />
        </div>

        {/* Game preview + Custom UI + finality badges */}
        {(gameType || customUI || showFinalityChip) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
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
            {showFinalityChip && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 light:text-amber-600"
                title={finality === 'pending'
                  ? 'Funding tx seen but not yet confirmed on-chain'
                  : 'On-chain and confirming. Not yet consensus-final (reversible until the finality depth).'}
              >
                <Clock size={9} />
                {finality === 'pending'
                  ? 'Pending'
                  : finEtaMin ? `Confirming · ~${finEtaMin}m` : 'Confirming'}
              </span>
            )}
          </div>
        )}

        {/* Disclosed wallets for verified */}
        {isPaidVerified && Array.isArray(disclosedWallets) && disclosedWallets.length > 0 && (
          <div className="mt-3 rounded-lg bg-emerald-500/[0.03] border border-emerald-500/15 p-2">
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
