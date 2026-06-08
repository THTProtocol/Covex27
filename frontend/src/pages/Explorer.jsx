import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Terminal, Database, Search, ShieldCheck, Sparkles, Play,
  Zap, Cpu, Coins, Clock, Filter, Layers, Eye, ArrowRight, Crown, Star,
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

  const [kaspaNetwork, setKaspaNetwork] = useState(() => localStorage.getItem('kaspaNetwork') || 'testnet-12');

  useEffect(() => {
    const handler = (e) => {
      const net = typeof e.detail === 'string' ? e.detail : localStorage.getItem('kaspaNetwork') || 'testnet-12';
      setKaspaNetwork(net);
    };
    window.addEventListener('kaspa-network-change', handler);
    return () => window.removeEventListener('kaspa-network-change', handler);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/covenants?network=${kaspaNetwork}`)
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
  }, [kaspaNetwork]);

  const handleSearch = useCallback((e) => {
    if (e?.preventDefault) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true); setSearchError(null); setSearchResults(null);
    const isTxId = q.includes(':');
    const isWalletAddr = q.startsWith('kaspatest:') || q.startsWith('kaspa:') || q.length >= 40;

    if (isTxId) {
      fetch(`/api/covenants/${encodeURIComponent(q)}?network=${kaspaNetwork}`)
        .then(r => r.json())
        .then(d => {
          setSearchResults({ type: 'covenant', data: d.success && d.covenant ? [d.covenant] : [] });
          if (!d.success || !d.covenant) setSearchError(`No covenant found for TXID: ${q.slice(0, 16)}...`);
          setSearchLoading(false);
        })
        .catch(err => { setSearchError(`Search failed: ${err.message}`); setSearchLoading(false); });
    } else if (isWalletAddr) {
      fetch(`/api/covenants?network=${kaspaNetwork}`)
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

  // Top visibility: paid covenants (those with verified tier or created via auth token) bubble up with badge + disclosure hint
  const renderCovenantCard = (c, isPaid) => {
    const t = (c.verified_tier || c.tier || 'FREE').toUpperCase();
    const accent = t === 'MAX' ? '#A855F7' : t === 'PRO' ? '#E8AF34' : t === 'BUILDER' ? '#3B82F6' : '#49EACB';
    const hasDisclosure = c.disclosed_wallets || c.creator_addr;
    return (
      <div key={c.id || c.txid} className={`group rounded-2xl border p-4 transition ${isPaid ? 'border-white/20 bg-white/[0.015] hover:border-white/30' : 'border-white/5 bg-white/[0.005] hover:border-white/10'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-white flex items-center gap-2">
              {c.name || (c.txid || '').slice(0, 12) + '...'}
              {isPaid && (
                <span className="text-[9px] px-1.5 py-px rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono flex items-center gap-1">
                  {t === 'MAX' && <Crown size={10} />} 
                  {t === 'PRO' && <Star size={10} />} 
                  {t === 'BUILDER' && <Terminal size={10} />} 
                  PAID VERIFIED • TOP
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{c.description || 'SilverScript covenant'}</div>
          </div>
          <div className="text-right text-[10px] font-mono" style={{ color: accent }}>{t}</div>
        </div>
        {hasDisclosure && (
          <div className="mt-2 text-[10px] text-gray-500 font-mono">Wallets disclosed • creator {TRUNC(c.creator_addr)} • treasury verified on-chain</div>
        )}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">{(c.amount_kaspa || 0).toFixed(2)} KAS</span>
          <span className="text-gray-500">• {c.network || 'tn12'}</span>
        </div>
      </div>
    );
  };

  const freeCovenants = displayCovenants.filter(c => {
    const t = (c.verified_tier || c.tier || 'FREE').toUpperCase();
    return t === 'FREE';
  });

  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative z-10 flex flex-col items-center justify-center pt-12 pb-6 px-4 sm:px-6 text-center">
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
      <div className="relative z-10 px-4 sm:px-6 pb-8 max-w-6xl mx-auto">
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
              <div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-3">
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
                <p className="text-xs text-gray-400 -mt-2 mb-4">Featured covenants are prioritized here with stronger visual presence.</p>
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
  // Strong signal for the "very easy creator-only nice custom UI + transparent viewer" feature:
  // When a creator has published a custom transparent UI, we surface it prominently in the list
  // so users know pressing the covenant will show the nice transparent "everything there is to know" view (no terminal for regular users).

  // Check for paid covenant metadata (from /api/covenant-metadata)
  let paidMetadata = null;
  try {
    const cfg = c.custom_ui_config;
    if (cfg && typeof cfg === 'object' && cfg.paid_token_hash) {
      paidMetadata = cfg;
    } else if (cfg && typeof cfg === 'string') {
      const parsed = JSON.parse(cfg);
      if (parsed.paid_token_hash) paidMetadata = parsed;
    }
  } catch (_) {}

  const isPaidVerified = !!paidMetadata;
  const disclosedWallets = paidMetadata?.disclosed_wallets;
  const covenantName = paidMetadata?.name || c.name || c.covenant_type || 'Unnamed Covenant';
  const covenantDesc = paidMetadata?.description || c.description || 'No description provided.';
  const themeAccent = paidMetadata?.theme?.accent || '#49EACB';

  // Only the creator sees their own tier badge.
  const isOwner = ownerAddress && c.creator_addr?.toLowerCase() === ownerAddress.toLowerCase();

  const tierCardClass = highlighted
    ? `${style.card} hover:border-kaspa-green/30 hover:-translate-y-0.5`
    : `${style.card} hover:border-white/10 hover:bg-white/[0.03]`;
  const cardBase = 'bg-[#0a0a0f]';

  const tierGlow = isPaidVerified
    ? 'shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20'
    : tier === 'MAX' ? 'shadow-[0_0_16px_rgba(168,85,247,0.12)] ring-1 ring-purple-500/10' 
    : tier === 'PRO' ? 'shadow-[0_0_12px_rgba(232,175,52,0.10)] ring-1 ring-amber-500/10'
    : tier === 'BUILDER' ? 'shadow-[0_0_8px_rgba(59,130,246,0.08)] ring-1 ring-blue-500/10'
    : 'ring-1 ring-white/5';

  return (
    <Link to={`/covenant/${encodeURIComponent(c.tx_id)}`}
      className={`block rounded-2xl border p-4 sm:p-5 transition-all duration-300 group cursor-pointer relative overflow-hidden ${tierGlow} ${tierCardClass} ${cardBase}`}
    >
      {isPaidVerified && <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-emerald-400/60 via-emerald-400/20 to-transparent" />}
      {isPremium && <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-kaspa-green/40 via-kaspa-green/10 to-transparent" />}
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className={`font-bold text-sm sm:text-base truncate ${highlighted ? 'text-kaspa-green' : 'text-white'}`} style={{ color: isPaidVerified ? themeAccent : undefined }}>
            {covenantName}
          </h3>
          <p className="text-[11px] font-mono mt-0.5 text-gray-300 truncate">{truncate(c.tx_id, 8)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right text-xs text-gray-400 tabular-nums ml-2 shrink-0 min-w-0">
          {isPaidVerified && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono flex items-center gap-1">
            {tier === 'MAX' && <Crown size={10} />}
            {tier === 'PRO' && <Star size={10} />}
            {tier === 'BUILDER' && <Terminal size={10} />}
            PAID VERIFIED</span>}
          {customUI && <span className="text-[8px] px-1.5 py-0.5 rounded bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/30 font-mono flex items-center gap-1">
            CREATOR TRANSPARENT UI
          </span>}
          {isHighTVL && <Badge variant="default">HIGH TVL</Badge>}
          <div className="flex items-center gap-1.5">
            {isOwner && (
              <Badge tier={tier} className="text-[9px] py-0 px-1.5">{style.label}</Badge>
            )}
            <span className="truncate">{formatKaspa(c.amount_kaspa)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-200 mb-3 line-clamp-2">{covenantDesc}</p>

      {/* Disclosed wallets section for paid verified covenants */}
      {isPaidVerified && Array.isArray(disclosedWallets) && disclosedWallets.length > 0 && (
        <div className="mb-3 rounded-lg bg-emerald-500/[0.03] border border-emerald-500/15 p-2.5">
          <div className="text-[10px] text-emerald-400 font-mono uppercase tracking-wide mb-1">All Wallets Disclosed</div>
          <div className="flex flex-wrap gap-1.5">
            {disclosedWallets.slice(0, 3).map((w, i) => (
              <span key={i} className="text-[9px] text-gray-300 bg-white/5 px-1.5 py-0.5 rounded">{w.role}</span>
            ))}
          </div>
        </div>
      )}

      <GamePreview covenant={c} compact={!customUI} large={!!customUI} />

      {(gameType || customUI) && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {gameType && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-kaspa-green/10 border border-kaspa-green/20 text-kaspa-green uppercase tracking-wider"><Play size={9} />{gameType} game</span>}
          {customUI && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300"><Sparkles size={9} />Custom UI</span>}
        </div>
      )}

      {/* Special colorful inviting treatment for Chess covenants - not a small window */}
      {gameType === 'chess' && (
        <div className="mt-3 -mx-1 p-3 rounded-2xl bg-gradient-to-br from-emerald-900/30 via-emerald-500/10 to-transparent border border-emerald-500/30">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold tracking-widest">
            ♟ 10 MIN WINNER-TAKES-ALL CHESS ARENA
          </div>
          <div className="text-[10px] text-emerald-300/90 mt-0.5">Stake any amount • Match in 5 min or auto-return • Full resign & time logic • 2% fee sustains the arena • ZK-verified moves</div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-1.5 text-[10px] text-gray-300">
        <span>Category: <span className="text-white">{c.category || 'general'}</span></span>
        <span>Amount: <span className="text-white">{formatKaspa(c.amount_kaspa)}</span></span>
        <span>Type: <span className="text-white truncate block">{c.covenant_type || 'N/A'}</span></span>
        <span>DAA: <span className="text-white">{c.block_daa_score?.toLocaleString() || 'Unknown'}</span></span>
      </div>

      <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hidden sm:flex gap-1.5">
        <Link
          to={`/covenant/${encodeURIComponent(c.tx_id)}?play=${gameType || 'chess'}`}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-kaspa-green/10 border border-kaspa-green/20 text-kaspa-green text-[10px] font-bold uppercase tracking-wider"
          onClick={(e) => e.stopPropagation()}
        >
          <Play size={11} />Play Now
        </Link>
        <div className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/5 border border-white/8 text-gray-300 text-[10px] font-bold uppercase tracking-wider">
          <Eye size={11} />View
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
