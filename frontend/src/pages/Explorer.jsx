import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Database, Search, Sparkles, Play,
  Coins, Layers, Crown, Star, Gamepad2, TrendingUp,
  ShieldCheck, Zap, ChevronDown,
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
import FirstCovenantTour from '../components/FirstCovenantTour';
import { Badge } from '../components/ui/Badge';
import { TIER_PALETTE, TIER_COLOR } from '../lib/tierPalette';

const formatKaspa = (kas) => {
  if (kas == null) return 'N/A';
  const num = Number(kas);
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M KAS`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K KAS`;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 2 })} KAS`;
};

// Compact count formatter for hero stat columns. At 375px the 3-up grid gives
// each cell ~100px, so a raw ".toLocaleString()" on totals over 9,999 wraps or
// clips. Abbreviate large counts (1.2k, 1.2M) to keep stat numbers on one line
// while small counts still render in full.
const formatCount = (n) => {
  if (n == null) return '0';
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return Math.round(num).toLocaleString();
};

const truncate = (s, n = 8) =>
  s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-4)}` : s || 'N/A';

// Tier identity, aligned with the canonical lib/tierPalette.js. MAX previously
// borrowed amber here, which collided with PRO across the rest of the app
// (PRO = kaspa-gold/amber on Pricing/Stats); now MAX = purple, PRO = amber/gold,
// BUILDER = blue, FREE = slate. Icons match the palette (FREE=Eye, BUILDER=
// Terminal, PRO=Star, MAX=Crown) so a paying customer sees the same glyph
// everywhere their purchase shows up. Tailwind class strings stay literal so
// the JIT can detect every utility.
const TIER_CONFIG = {
  MAX: {
    label: 'MAX',
    gradient: 'from-purple-500/20 via-purple-600/10 to-transparent',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    // Canonical .tier-glow-max utility (defined in index.css), so every PRO/MAX/
    // BUILDER card on every surface shares one glow recipe instead of three
    // hand-rolled box-shadow strings that drifted apart.
    glow: 'tier-glow-max',
    rank: 4,
    icon: TIER_PALETTE.MAX.icon,
  },
  PRO: {
    label: 'PRO',
    // PRO accent is sourced from tierPalette (#E8AF34, Kaspa-gold). Previously the
    // gradient/border/text used Tailwind's amber-400/500 utilities, which render
    // a generic orange-amber, NOT brand gold; the same PRO user then saw gold on
    // Pricing and orange on Explorer. Literal hex tokens via arbitrary values keep
    // Tailwind JIT happy and lock the surface to the canonical gold.
    gradient: 'from-[#E8AF34]/20 via-[#E8AF34]/10 to-transparent',
    border: 'border-[#E8AF34]/30',
    text: 'text-[#E8AF34]',
    badge: 'bg-[#E8AF34]/15 text-[#E8AF34] border-[#E8AF34]/30',
    glow: 'tier-glow-pro',
    rank: 3,
    icon: TIER_PALETTE.PRO.icon,
  },
  BUILDER: {
    label: 'BUILDER',
    gradient: 'from-blue-500/15 via-blue-600/8 to-transparent',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    glow: 'tier-glow-builder',
    rank: 2,
    icon: TIER_PALETTE.BUILDER.icon,
  },
  FREE: {
    label: 'FREE',
    gradient: 'from-white/5 to-transparent',
    border: 'border-white/8',
    text: 'text-gray-300 light:text-slate-600',
    badge: 'bg-white/5 text-gray-300 light:text-slate-600 border-white/10',
    glow: '',
    rank: 0,
    icon: TIER_PALETTE.FREE.icon,
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
    <div className="flex flex-col items-center justify-center gap-1 py-4 px-2 hover:bg-white/[0.025] light:hover:bg-slate-50 transition-colors">
      <p className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-gray-400 light:text-slate-500 font-mono uppercase tracking-[0.18em]">
        <Icon size={11} className="text-kaspa-green/80" />{label}
      </p>
      <p className="text-lg sm:text-xl font-black text-white light:text-slate-900 tabular-nums">{fmt(n)}</p>
    </div>
  );
}

// Lightweight load-time entrance: each card fades + rises 12px, staggered. Drop-in layer
// around the grid only - it never touches card internals, so the CovenantCard hover-lift
// still works. Disabled under prefers-reduced-motion.
const GRID_STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.025 } } };
const CARD_RISE = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } } };

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
  // LABELED now (no fabricated types), so there's no reason to hide them - "Verified only" is an
  // opt-in filter for users who want just paid + real-description covenants.
  const [includeRaw, setIncludeRaw] = useState(true);
  const [kaspaNetwork, setKaspaNetwork] = useState(() => localStorage.getItem('kaspaNetwork') || 'mainnet');
  const [activeCategory, setActiveCategory] = useState('All');
  const [offset, setOffset] = useState(0);
  const [liveMatches, setLiveMatches] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);
  // Tour mount flag. The tour itself reads localStorage `covex_tour_active`,
  // so triggering it from a click means: clear the skipped flag, set the
  // active flag, then mount the component. The tour falls back to a
  // centered modal when the step-1 anchor is not present, so it never
  // gets stuck even if no covenant cards are visible.
  const [tourMounted, setTourMounted] = useState(false);
  const startTour = useCallback(() => {
    try {
      window.localStorage.removeItem('covex_tour_skipped');
      window.localStorage.setItem('covex_tour_active', '1');
    } catch {
      /* ignore quota / private mode */
    }
    setTourMounted(true);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      setKaspaNetwork(typeof e.detail === 'string' ? e.detail : localStorage.getItem('kaspaNetwork') || 'mainnet');
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

  const netLabel = 'MAINNET';

  return (
    <>
      {/* HERO */}
      <section className="relative z-10 flex flex-col items-center justify-center pt-14 sm:pt-20 pb-10 px-4 sm:px-6 text-center">
        <div className="covex-aurora" style={{ top: 8, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 560, height: 300, maxWidth: '88vw' }} aria-hidden="true" />
        <h1
          className="relative font-black text-white light:text-slate-900 mb-6 max-w-3xl leading-[1.1] animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{ fontSize: 'clamp(2.25rem, 5.5vw, 4.5rem)', letterSpacing: '-0.025em', textWrap: 'balance' }}
        >
          Interactive Covenants for <span className="text-kaspa-green">The Kaspa BlockDAG</span>
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-gray-200 light:text-slate-600 max-w-2xl mx-auto leading-relaxed mb-8 animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_0.07s_both]">
          Discover, deploy, and interact with SilverScript covenants. Programmable UTXOs at 10 blocks per second.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10 animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_0.1s_both]">
          <Link
            to="/sandbox"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-kaspa-green text-black font-bold text-sm shadow-[0_10px_34px_-10px_rgba(73,234,203,0.65)] hover:shadow-[0_14px_44px_-8px_rgba(73,234,203,0.85)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
          >
            <Sparkles size={16} className="transition-transform duration-300 group-hover:rotate-12" />
            Build a Covenant
          </Link>
          {/* Secondary CTA: consensus-enforced primitives (hashlock, timelocks, HTLC, channel,
              dead-man, multisig) stay one click away as a single neutral ghost button so
              "Build a Covenant" is the only primary action. */}
          <Link
            to="/deploy/enforced"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/15 light:border-slate-300 bg-white/[0.03] light:bg-white text-white/85 light:text-slate-700 font-semibold text-sm hover:border-white/30 light:hover:border-slate-400 hover:bg-white/[0.06] light:hover:bg-slate-50 hover:text-white light:hover:text-slate-900 transition-all duration-300"
          >
            <ShieldCheck size={16} className="text-white/70 light:text-slate-500 transition-transform duration-300 group-hover:scale-110" />
            Deploy on-chain enforced
          </Link>
          {/* Quiet tertiary link: "How It Works" is informational, not an action. */}
          <Link
            to="/readme"
            className="inline-flex items-center gap-2 px-2 py-3 text-sm font-medium text-white/60 light:text-slate-500 hover:text-white light:hover:text-slate-900 underline-offset-4 hover:underline transition-colors duration-300"
          >
            How It Works
          </Link>
        </div>
        {/* Calm tertiary text link: launches the FirstCovenantTour overlay,
            which anchors step 1 to the first visible covenant card (with a
            centered-modal fallback if no anchor matches). Honesty-first copy:
            describes a guided walkthrough, not a product claim. */}
        <div className="-mt-6 mb-10">
          <button
            type="button"
            onClick={startTour}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/55 light:text-slate-500 hover:text-white light:hover:text-slate-900 underline-offset-4 hover:underline transition-colors duration-300"
          >
            Take the 60-second tour
          </button>
        </div>
        <div className="hover-lift w-full max-w-2xl mx-auto rounded-2xl border border-white/[0.07] light:border-slate-200 bg-gradient-to-b from-white/[0.04] to-white/[0.01] light:from-white light:to-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_48px_-24px_rgba(73,234,203,0.3)] light:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)] grid grid-cols-3 divide-x divide-white/[0.06] light:divide-slate-200 mb-6 overflow-hidden animate-[slide-up_0.55s_cubic-bezier(0.16,1,0.3,1)_0.14s_both]">
          {[
            { icon: Layers, label: `${netLabel} Covenants`, value: stats.total, fmt: formatCount },
            { icon: TrendingUp, label: 'Paid Tiers', value: stats.paidCount, fmt: formatCount },
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 light:bg-white border border-white/10 light:border-slate-200 text-sm text-white/80 light:text-slate-700 hover:text-white light:hover:text-slate-900 hover:border-white/20 light:hover:border-slate-300 transition-all"
          >
            <Layers size={16} className="text-kaspa-green" />
            {activeCategory === 'All' ? 'All Covenant Types' : activeCategory}
            <ChevronDown
              size={12}
              className={`opacity-60 transition-transform duration-200 ${showCategoryPanel ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>

        {showCategoryPanel && (
          <div className="max-w-4xl mx-auto mb-8 p-4 rounded-2xl glass-panel border border-white/10 light:border-slate-200">
            <div className="text-[10px] uppercase tracking-widest text-white/40 light:text-slate-500 mb-3 text-center">Filter by Covenant Type, click any to apply</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 text-xs">
              {ALL_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); setShowCategoryPanel(false); }}
                  className={`px-3 py-2 rounded-xl border text-left transition-all ${activeCategory === cat ? 'bg-kaspa-green/10 border-kaspa-green/40 text-kaspa-green font-semibold' : 'border-white/10 light:border-slate-200 bg-white/[0.015] light:bg-white text-white/70 light:text-slate-600 hover:text-white light:hover:text-slate-900 hover:border-white/20 light:hover:border-slate-300 hover:bg-white/5 light:hover:bg-slate-50'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="text-center mt-3">
              <button onClick={() => { setActiveCategory('All'); setShowCategoryPanel(false); }} className="text-[10px] text-white/50 light:text-slate-500 hover:text-white light:hover:text-slate-900 underline">Clear / Show All Types</button>
            </div>
          </div>
        )}
      </section>

      {/* CONTROLS - Explore / Search / Arena, one segmented control with Arena as the amber-accent third tab */}
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
            <button
              onClick={() => { setShowArena(!showArena); setActiveTab('explore'); setSearchResults(null); setSearchError(null); setSearchQuery(''); }}
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
                  placeholder="kaspa:qr... or covenant txid (hash:0)"
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
              <button onClick={() => setSearchQuery('kaspa:')} className="px-2 py-0.5 rounded border border-white/5 hover:border-kaspa-green/20 hover:text-kaspa-green transition-colors font-mono">kaspa:...</button>
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
                  const tierAccent = TIER_COLOR[tierKey] || TIER_COLOR.FREE;
                  return (
                    <div key={g.tx_id || i} className={`hover-lift relative overflow-hidden glass-panel rounded-3xl p-5 border transition-all ${cfg.border} bg-gradient-to-br ${cfg.gradient} ${cfg.glow} min-h-[210px] flex flex-col`}>
                      <div
                        aria-hidden="true"
                        className="absolute top-0 inset-x-0 h-[3px]"
                        style={{ background: `linear-gradient(90deg, transparent, ${tierAccent}, transparent)` }}
                      />
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className={`text-xs font-bold tracking-[2px] ${cfg.text}`}>{(g.covenant_type || g.name || 'Game').toUpperCase()}</div>
                          <div className="text-lg font-bold text-white mt-1 truncate">{g.name || g.covenant_type || 'Unknown'}</div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className={`text-xs ${cfg.text} font-mono`}>{g.participant_count || 1} / 2</div>
                          <div className="font-mono text-lg text-white font-bold">{formatKaspa(stakeAmt)}</div>
                          {cfg.rank > 1 && <span className={`label-xs mt-1 px-1.5 py-0.5 rounded ${cfg.badge} inline-block font-mono`}>{cfg.label}</span>}
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-7" aria-busy="true">
                <span className="sr-only">Loading from the BlockDAG...</span>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton rounded-3xl min-h-[210px]" aria-hidden="true" />
                ))}
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
                  /* Teach-empty-state: the filtered result set is zero, so
                     instead of a dead end we offer the guided tour (primary)
                     and a one-click filter reset (secondary). Light + dark
                     parity, no em dashes, no overclaims. */
                  <div className="glass-panel rounded-2xl px-6 py-12 text-center">
                    <p className="text-lg font-semibold text-white light:text-slate-900 mb-1">No covenants match those filters.</p>
                    <p className="text-sm text-gray-300 light:text-slate-600 mb-5">Want to build one? It takes about a minute.</p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={startTour}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-kaspa-green text-black font-bold text-sm shadow-[0_10px_34px_-10px_rgba(73,234,203,0.65)] hover:shadow-[0_14px_44px_-8px_rgba(73,234,203,0.85)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
                      >
                        Take the 60-second tour
                      </button>
                      <button
                        type="button"
                        onClick={() => { setActiveCategory('All'); setSearchQuery(''); setShowCategoryPanel(false); }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/15 light:border-slate-300 bg-white/[0.03] light:bg-white text-white/85 light:text-slate-700 font-semibold text-sm hover:border-white/30 light:hover:border-slate-400 hover:bg-white/[0.06] light:hover:bg-slate-50 hover:text-white light:hover:text-slate-900 transition-all duration-300"
                      >
                        Clear filters
                      </button>
                    </div>
                  </div>
                ) : (
                  <motion.div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-7"
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
      {/* Mount the FirstCovenantTour overlay only after the user clicks a
          "Take the 60-second tour" trigger. The tour component itself reads
          localStorage `covex_tour_active` to start; we also still respect the
          ?tour=1 URL param activation by mounting unconditionally when that
          flag is already set on first render. */}
      {tourMounted && <FirstCovenantTour />}
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
      className={`group relative flex flex-col rounded-2xl border overflow-hidden transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform hover:-translate-y-1 ${
        isPaid
          ? `${cfg.border} ${cfg.glow} holo-border hover:shadow-2xl`
          : 'border-white/[0.08] light:border-slate-200 hover:border-[color:var(--ca)] hover:shadow-[0_22px_55px_-22px_var(--cg)]'
      } bg-gradient-to-br from-[#15151f] via-[#0e0e16] to-[#0a0a0f] light:from-white light:via-white light:to-slate-50 min-h-[340px]`}
      style={!isPaid ? { '--ca': accA(0.55), '--cg': accA(0.4) } : undefined}
    >
      {/* Top accent bar - paid cards project their tier identity (brand-consistent
          with TIER_COLOR), FREE cards keep the per-card on-chain hue so the
          unpaid wall still reads as a varied marketplace. Same render shape as
          the Card primitive's accent prop. */}
      <div className="h-[3px] w-full shrink-0" aria-hidden="true"
        style={{ background: `linear-gradient(90deg, transparent, ${isPaid ? (TIER_COLOR[tierKey] || cardAccent) : cardAccent}, transparent)`, opacity: isPaid ? 0.6 : 0.8 }} />

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
              <span className="label-xs px-1.5 py-0.5 rounded-md bg-kaspa-green/25 text-kaspa-green border border-kaspa-green/40 font-mono animate-pulse">NEW</span>
            )}
            {isPaid && (
              <span className={`label-xs px-2 py-0.5 rounded-md border ${cfg.badge} font-mono inline-flex items-center gap-1`}>
                <IconComponent size={10} />{cfg.label}
              </span>
            )}
            {isPaidVerified && (
              <span className="label-xs px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 light:text-amber-700 border border-amber-500/30 font-mono">CURATED</span>
            )}
            {/* Enforcement reality - the trust signal lives in the header row now, next to the
                CURATED chip, so a glance at the card top tells you exactly what backs it.
                `compact` shortens the label (ON-CHAIN / HYBRID / ORACLE / FULL-ZK / METADATA)
                so the full chip group still fits on one row at 375px. Click opens the same
                Transparency modal with the full honest description. */}
            <TrustBadge covenant={c} size="sm" compact />
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-white/70 light:text-slate-500 truncate max-w-[44%]">
            {(() => { const CI = CATEGORY_ICON[categoryLabel.toLowerCase()] || Boxes; return <CI size={11} className="opacity-80 shrink-0" />; })()}
            <span className="truncate">{categoryLabel}</span>
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-6 flex flex-col flex-1 space-y-4">
        {/* Title + on-chain id - tight title/hash pair, then the rest of the column lifts on space-y-4 */}
        <div>
          <h3 className={`font-extrabold text-[17px] sm:text-[18px] leading-tight tracking-[-0.01em] truncate ${isPaid ? cfg.text : 'text-white light:text-slate-900'}`}
            style={isPaidVerified ? { color: themeAccent } : undefined}>
            {covenantName}
          </h3>
          <div className="mt-0.5 text-[10px] font-mono text-gray-500 light:text-slate-400 truncate opacity-60">{txShort}...</div>
        </div>

        {/* Value-locked hero + live status (the pot - leads like a gambling card) */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="label-xs text-gray-500 light:text-slate-400 mb-1">Value Locked</div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[20px] sm:text-[22px] font-black leading-none tracking-tight text-white light:text-slate-900 tabular-nums"
                style={!isPaid ? { textShadow: `0 0 22px ${accA(0.32)}` } : undefined}>
                {formatKaspa(amount).replace(/\s*KAS$/i, '')}
              </span>
              <span className="text-[11px] font-bold text-gray-400 light:text-slate-500">KAS</span>
            </div>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full label-xs border ${isActive ? 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25' : 'bg-white/[0.04] text-gray-400 border-white/10'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
            {statusLabel}
          </span>
        </div>

        {/* Description - hard-clamped to exactly 2 lines with a clean ellipsis (inline styles so the
            webkit-box clamp always wins over flex-1, which previously defeated line-clamp and let the
            text spill and cut mid-sentence). break-words stops a long hash/word from overflowing. */}
        <p
          className="text-xs text-gray-400 light:text-slate-500 leading-relaxed break-words"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {covenantDesc}
        </p>

        {/* TrustBadge now lives in the header row, next to CURATED. */}

        {/* Game preview + Custom UI + finality badges */}
        {(gameType || customUI || showFinalityChip) && (
          <div className="flex flex-wrap gap-1.5">
            {gameType && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 label-xs rounded-full bg-kaspa-green/10 border border-kaspa-green/20 text-kaspa-green">
                <Play size={9} />{gameType}
              </span>
            )}
            {customUI && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 label-xs rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300">
                <Sparkles size={9} />Custom UI
              </span>
            )}
            {showFinalityChip && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 label-xs rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 light:text-amber-600"
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
          <div className="rounded-lg bg-emerald-500/[0.03] border border-emerald-500/15 p-2">
            <div className="label-xs text-emerald-400 font-mono mb-1">Wallets Disclosed</div>
            <div className="flex flex-wrap gap-1">
              {disclosedWallets.slice(0, 3).map((w, i) => (
                <span key={i} className="label-xs text-gray-400 bg-white/5 px-1.5 py-0.5 rounded font-mono">{w.role}</span>
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
