import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Terminal, Database, Search, ShieldCheck, Sparkles, Play,
  Zap, Cpu, Coins, Clock, Filter, Layers, Eye, ArrowRight,
  ChevronRight, TrendingUp, Users
} from 'lucide-react';
import { useWallet } from '../components/WalletContext';
import GamePreview, { detectGameType, hasCustomUI } from '../components/GamePreview';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

const TIER_STYLES = {
  MAX: { card: 'border-purple-500/20 bg-purple-500/[0.03]', badge: 'tier-MAX', label: 'MAX' },
  PRO: { card: 'border-amber-500/15 bg-amber-500/[0.02]', badge: 'tier-PRO', label: 'PRO' },
  BUILDER: { card: 'border-blue-500/10 bg-blue-500/[0.015]', badge: 'tier-BUILDER', label: 'BUILDER' },
  FREE: { card: 'border-white/5 bg-white/[0.005]', badge: 'tier-FREE', label: 'FREE' },
};

const formatKaspa = (kas) => {
  if (kas == null) return 'N/A';
  return `${kas.toLocaleString(undefined, { maximumFractionDigits: 3 })} KAS`;
};

const truncate = (s, n = 8) =>
  s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-4)}` : s || 'N/A';

export default function Explorer() {
  const { address } = useWallet();
  const [covenants, setCovenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('explore');
  const [showMyCovenants, setShowMyCovenants] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [stats, setStats] = useState({ total: 0, paidCount: 0, totalTVL: 0 });

  useEffect(() => {
    fetch('/api/covenants')
      .then(res => res.json())
      .then(data => {
        const list = (Array.isArray(data.covenants) ? data.covenants : []);
        setCovenants(list);
        const paid = list.filter(c => {
          const t = (c.verified_tier || c.tier || 'FREE').toUpperCase();
          return t === 'MAX' || t === 'PRO' || t === 'BUILDER';
        });
        setStats({ total: list.length, paidCount: paid.length, totalTVL: list.reduce((s, c) => s + (c.amount_kaspa || 0), 0) });
        setLoading(false);
      })
      .catch(err => { setError('Could not load covenants'); setLoading(false); });
  }, []);

  const handleSearch = useCallback((e) => {
    if (e?.preventDefault) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true); setSearchError(null); setSearchResults(null);
    const isTxId = q.includes(':');
    const isWalletAddr = q.startsWith('kaspatest:') || q.startsWith('kaspa:') || q.length >= 40;

    if (isTxId) {
      fetch(`/api/covenants/${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => {
          setSearchResults({ type: 'covenant', data: d.success && d.covenant ? [d.covenant] : [] });
          if (!d.success || !d.covenant) setSearchError(`No covenant found for TXID: ${q.slice(0, 16)}...`);
          setSearchLoading(false);
        })
        .catch(err => { setSearchError(`Search failed: ${err.message}`); setSearchLoading(false); });
    } else if (isWalletAddr) {
      fetch('/api/covenants')
        .then(r => r.json())
        .then(d => {
          const all = Array.isArray(d.covenants) ? d.covenants : [];
          const matches = all.filter(c => c.creator_addr?.toLowerCase().includes(q.toLowerCase()));
          setSearchResults({ type: 'wallet', query: q, data: matches });
          if (matches.length === 0) setSearchError(`No covenants found for wallet: ${q.slice(0, 20)}...`);
          setSearchLoading(false);
        })
        .catch(err => { setSearchError(`Search failed: ${err.message}`); setSearchLoading(false); });
    } else {
      setSearchError('Enter a Kaspa wallet address (kaspatest:...) or covenant TXID (hash:index)');
      setSearchLoading(false);
    }
  }, [searchQuery]);

  const tierRank = { MAX: 3, PRO: 2, BUILDER: 1, FREE: 0 };

  let displayCovenants = covenants;
  if (showMyCovenants && address) {
    displayCovenants = covenants.filter(c => c.creator_addr?.toLowerCase() === address.toLowerCase());
  }

  const paidCovenants = displayCovenants
    .filter(c => { const t = (c.verified_tier || c.tier || 'FREE').toUpperCase(); return t === 'MAX' || t === 'PRO' || t === 'BUILDER'; })
    .sort((a, b) => {
      const aT = tierRank[(a.verified_tier || a.tier || 'FREE').toUpperCase()] || 0;
      const bT = tierRank[(b.verified_tier || b.tier || 'FREE').toUpperCase()] || 0;
      if (bT !== aT) return bT - aT;
      return (b.amount_kaspa || 0) - (a.amount_kaspa || 0);
    });

  const freeCovenants = displayCovenants.filter(c => {
    const t = (c.verified_tier || c.tier || 'FREE').toUpperCase();
    return t === 'FREE';
  });

  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative z-10 flex flex-col items-center justify-center pt-20 pb-8 px-4 sm:px-6 text-center">
        <div className="mb-5">
          <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" fill="none" viewBox="0 0 48 48" className="drop-shadow-[0_0_25px_rgba(73,234,203,0.35)]">
            <defs>
              <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#49EACB"/><stop offset="50%" stopColor="#00D2FF"/><stop offset="100%" stopColor="#7e14ff"/>
              </linearGradient>
            </defs>
            <line x1="7" y1="10" x2="7" y2="38" stroke="url(#heroGrad)" strokeWidth="1.5" opacity="0.7"/>
            <line x1="7" y1="10" x2="18" y2="6" stroke="url(#heroGrad)" strokeWidth="1" opacity="0.5"/>
            <line x1="7" y1="38" x2="18" y2="42" stroke="url(#heroGrad)" strokeWidth="1" opacity="0.5"/>
            <circle cx="7" cy="10" r="3" fill="#49EACB"/>
            <circle cx="7" cy="24" r="3.2" fill="#00D2FF"/>
            <circle cx="7" cy="38" r="3" fill="#7e14ff"/>
            <circle cx="18" cy="6" r="2" fill="#7e14ff" opacity="0.85"/>
            <circle cx="18" cy="42" r="2" fill="#49EACB" opacity="0.85"/>
          </svg>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-4 max-w-3xl leading-[1.15]">
          Interactive Covenants for <span className="text-kaspa-green">The Kaspa BlockDAG</span>
        </h1>
        <p className="text-sm sm:text-base text-gray-200 max-w-xl mx-auto leading-relaxed mb-8">
          Discover, deploy, and interact with SilverScript covenants. Programmable UTXOs at 10 blocks per second.
        </p>
        <div className="w-full max-w-2xl mx-auto glass-panel rounded-2xl p-4 sm:p-5 grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { icon: Layers, label: 'Covenants', value: stats.total },
            { icon: Sparkles, label: 'Paid Tiers', value: stats.paidCount },
            { icon: Coins, label: 'Total TVL', value: `${Math.round(stats.totalTVL).toLocaleString()} KAS` },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2 sm:gap-3 justify-center">
              <s.icon size={16} className="text-kaspa-green shrink-0" />
              <div className="text-left">
                <p className="text-[10px] text-gray-300 font-mono uppercase tracking-wider">{s.label}</p>
                <p className="text-sm font-bold text-white">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ CONTROLS ═══ */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pb-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex rounded-xl bg-white/[0.03] border border-white/5 p-0.5">
            {[
              { id: 'explore', icon: Database, label: 'Explore' },
              { id: 'search', icon: Search, label: 'Search' },
            ].map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSearchResults(null); setSearchError(null); setSearchQuery(''); }}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === tab.id ? 'bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/20' : 'text-gray-300 hover:text-white'
                }`}
              >
                <tab.icon size={12} /><span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          {address && activeTab === 'explore' && (
            <button onClick={() => setShowMyCovenants(!showMyCovenants)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                showMyCovenants ? 'bg-kaspa-green/10 text-kaspa-green border-kaspa-green/30' : 'border-white/5 text-gray-300 hover:text-white hover:border-white/15'
              }`}
            >
              <ShieldCheck size={12} /><span className="hidden sm:inline">My Covenants</span>
            </button>
          )}
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="relative z-10 px-4 sm:px-6 pb-16 max-w-6xl mx-auto">
        {/* SEARCH TAB */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <form onSubmit={handleSearch} className="relative">
              <div className="relative flex items-center gap-3 p-3 sm:p-4 rounded-2xl glass-panel focus-within:border-kaspa-green/40 focus-within:shadow-[0_0_30px_rgba(73,234,203,0.15)] transition-all">
                <Search size={18} className="text-kaspa-green shrink-0" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="kaspatest:qr... or covenant txid (hash:0)"
                  className="flex-1 bg-transparent border-none outline-none text-sm font-mono text-white placeholder:text-gray-200"
                  autoFocus spellCheck={false} autoComplete="off"
                />
                <button type="submit" disabled={searchLoading || !searchQuery.trim()}
                  className="px-4 py-2 rounded-xl bg-kaspa-green text-black font-bold text-xs hover:shadow-[0_0_20px_rgba(73,234,203,0.4)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
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
                  {searchResults.data.map((c, i) => <CovenantCard key={c.tx_id || i} covenant={c} index={i} ownerAddress={address} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* EXPLORE TAB */}
        {activeTab === 'explore' && (
          <>
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-300 gap-3">
                <div className="w-10 h-10 border-2 border-kaspa-green/20 border-t-kaspa-green rounded-full animate-spin" />
                <p className="text-sm font-mono">Loading from the BlockDAG...</p>
              </div>
            )}
            {error && <p className="text-red-500 text-center py-10">{error}</p>}

            {!loading && covenants.length === 0 && (
              <div className="glass-panel rounded-2xl p-10 text-center">
                <Layers size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-lg font-semibold text-white mb-1">No covenants detected yet</p>
                <p className="text-sm text-gray-300">The Kaspa node is still syncing. Covenants will appear automatically.</p>
              </div>
            )}

            {!loading && showMyCovenants && covenants.length > 0 && displayCovenants.length === 0 && (
              <div className="glass-panel rounded-2xl p-10 text-center">
                <ShieldCheck size={40} className="mx-auto text-kaspa-green mb-3" />
                <p className="text-lg font-semibold text-white mb-1">No covenants from this wallet</p>
                <p className="text-sm text-gray-300 mb-4">You haven't deployed any covenants with the connected wallet.</p>
                <Button onClick={() => navigate('/premium')}><Terminal size={14} />Deploy Your First Covenant</Button>
              </div>
            )}

            {!loading && paidCovenants.length > 0 && (
              <>
                <SectionLabel icon={Sparkles} label="Featured Covenants" accent />
                <p className="text-xs text-gray-400 -mt-2 mb-4">Higher-tier covenants are prioritized here with stronger visual presence (no tier names shown publicly).</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-8">
                  {paidCovenants.map((c, i) => <CovenantCard key={c.tx_id || i} covenant={c} index={i} highlighted ownerAddress={address} />)}
                </div>
              </>
            )}

            {!loading && (
              <>
                <SectionLabel icon={Play} label="Interactive & Demos" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <DemoCard icon={Cpu} title="ZK Chess Arena" desc="Pro full-screen chess.com-smooth after equal stakes. Clocks, move list, large board, oracle attested. Real ZK circuit path ready." tags={['Pro UI','Chess','Oracle+ZK']} path="/covenant?demo=chess" />
                  <DemoCard icon={Users} title="Poker Pro Table" desc="Texas Hold'em full-screen pro table after matched stakes. Hole cards, community, betting actions. Oracle attested + ZK hand ranking coming." tags={['Pro UI','Poker','Oracle']} path="/covenant?demo=poker" />
                  <DemoCard icon={TrendingUp} title="Blackjack Pro Table" desc="Full-screen felt table with hit/stand, dealer reveal, oracle attested result. Stake match gate for equal risk." tags={['Pro UI','Blackjack','Oracle']} path="/covenant?demo=blackjack" />
                  <DemoCard icon={TrendingUp} title="Range Proof Verifier" desc="Prove a value is within bounds without revealing it. Groth16 ceremony artifacts ready, witness generation fix pending." tags={['ZK Proof','Privacy','Groth16']} path="/covenant?demo=range" />
                </div>
              </>
            )}

            {!loading && freeCovenants.length > 0 && (
              <>
                <SectionLabel icon={Layers} label={paidCovenants.length > 0 ? 'All Covenants' : 'Covenants'} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  {freeCovenants.map((c, i) => <CovenantCard key={c.tx_id || i} covenant={c} index={i} ownerAddress={address} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ── Section Label ── */
function SectionLabel({ icon: Icon, label, accent }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`h-px flex-1 ${accent ? 'bg-gradient-to-r from-kaspa-green/30 to-transparent' : 'bg-gradient-to-r from-white/5 to-transparent'}`} />
      <span className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${accent ? 'text-kaspa-green' : 'text-gray-300'}`}>
        <Icon size={12} />{label}
      </span>
      <div className={`h-px flex-1 ${accent ? 'bg-gradient-to-l from-kaspa-green/30 to-transparent' : 'bg-gradient-to-l from-white/5 to-transparent'}`} />
    </div>
  );
}

/* ── Covenant Card ── */
function CovenantCard({ covenant: c, index, highlighted, ownerAddress }) {
  const tier = (c.verified_tier || c.tier || 'FREE').toUpperCase();
  const style = TIER_STYLES[tier] || TIER_STYLES.FREE;
  const isPremium = tier === 'MAX' || tier === 'PRO';
  const isHighTVL = (c.amount_kaspa || 0) >= 100;
  const gameType = detectGameType(c);
  const customUI = hasCustomUI(c);

  // Only the creator sees their own tier badge.
  // Regular visitors see prioritized placement/visual weight only (no explicit tier label).
  const isOwner = ownerAddress && c.creator_addr?.toLowerCase() === ownerAddress.toLowerCase();

  // Apply tier-specific card styling (border + bg tint) for all viewers.
  // Only the creator sees the explicit tier badge text.
  const tierCardClass = highlighted
    ? `${style.card} hover:border-kaspa-green/30 hover:-translate-y-0.5`
    : `${style.card} hover:border-white/10 hover:bg-white/[0.03]`;
  // Ensure cards have enough visual separation even with glows
  const cardBase = 'bg-[#0a0a0f]'; // solid base to prevent bleed-through from shadows/glows of neighbors

  // Higher-tier glow for MAX/PRO - toned down to avoid visual overlap in dense grids
  const tierGlow = tier === 'MAX' ? 'shadow-[0_0_16px_rgba(168,85,247,0.12)] ring-1 ring-purple-500/10' 
    : tier === 'PRO' ? 'shadow-[0_0_12px_rgba(232,175,52,0.10)] ring-1 ring-amber-500/10'
    : tier === 'BUILDER' ? 'shadow-[0_0_8px_rgba(59,130,246,0.08)] ring-1 ring-blue-500/10'
    : 'ring-1 ring-white/5';

  return (
    <Link to={`/covenant/${encodeURIComponent(c.tx_id)}`}
      className={`block rounded-2xl border p-4 sm:p-5 transition-all duration-300 group cursor-pointer relative overflow-hidden ${tierGlow} ${tierCardClass} ${cardBase}`}
    >
      {isPremium && <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-kaspa-green/40 via-kaspa-green/10 to-transparent" />}
      {isHighTVL && <div className="absolute top-3 right-3"><Badge variant="default">HIGH TVL</Badge></div>}

      {/* Tier badge ONLY visible to the covenant creator.
          Regular visitors see Featured Covenants prioritized by tier + TVL
          via visual styling only — no explicit tier names are shown publicly. */}
      {isOwner && (
        <div className="absolute top-2 right-2">
          <Badge tier={tier}>{style.label}</Badge>
        </div>
      )}

      <div className="flex items-start justify-between mb-2.5">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className={`font-bold text-sm sm:text-base truncate ${highlighted ? 'text-kaspa-green' : 'text-white'}`}>
            {c.name || c.covenant_type || 'Unnamed Covenant'}
          </h3>
          <p className="text-[11px] font-mono mt-0.5 text-gray-300 truncate">{truncate(c.tx_id, 8)}</p>
        </div>
        <div className="text-right text-xs text-gray-400 tabular-nums ml-2 shrink-0">
          {formatKaspa(c.amount_kaspa)}
        </div>
      </div>

      <p className="text-xs text-gray-200 mb-3 line-clamp-2">{c.description || 'No description provided.'}</p>
      <GamePreview covenant={c} compact />

      {(gameType || customUI) && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {gameType && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-kaspa-green/10 border border-kaspa-green/20 text-kaspa-green uppercase tracking-wider"><Play size={9} />{gameType} game</span>}
          {customUI && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300"><Sparkles size={9} />Custom UI</span>}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-1.5 text-[10px] text-gray-300">
        <span>Category: <span className="text-white">{c.category || 'general'}</span></span>
        <span>Amount: <span className="text-white">{formatKaspa(c.amount_kaspa)}</span></span>
        <span>Type: <span className="text-white truncate block">{c.covenant_type || 'N/A'}</span></span>
        <span>DAA: <span className="text-white">{c.block_daa_score?.toLocaleString() || 'Unknown'}</span></span>
      </div>

      <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hidden sm:block">
        <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-kaspa-green/10 border border-kaspa-green/20 text-kaspa-green text-[10px] font-bold uppercase tracking-wider">
          <Eye size={11} />View Covenant
        </div>
      </div>
    </Link>
  );
}

/* ── Demo Card ── */
function DemoCard({ icon: Icon, title, desc, tags, path }) {
  return (
    <Link to={path} className="block rounded-2xl border border-kaspa-green/10 bg-kaspa-green/[0.015] p-5 hover:border-kaspa-green/25 hover:bg-kaspa-green/[0.03] transition-all duration-300 group">
      <div className="w-10 h-10 rounded-xl bg-kaspa-green/10 border border-kaspa-green/20 flex items-center justify-center mb-3 group-hover:shadow-[0_0_15px_rgba(73,234,203,0.2)] transition-all">
        <Icon size={20} className="text-kaspa-green" />
      </div>
      <h3 className="font-bold text-sm text-white mb-1.5 group-hover:text-kaspa-green transition-colors">{title}</h3>
      <p className="text-xs text-gray-300 mb-3 line-clamp-2">{desc}</p>
      <div className="flex flex-wrap gap-1">
        {tags.map(tag => <span key={tag} className="px-2 py-0.5 text-[9px] font-semibold rounded-full bg-kaspa-green/8 border border-kaspa-green/15 text-kaspa-green">{tag}</span>)}
      </div>
    </Link>
  );
}
