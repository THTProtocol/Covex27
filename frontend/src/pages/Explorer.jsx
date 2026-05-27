import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Terminal, Database, Code2, Zap, ShieldCheck, Globe, ExternalLink, Info, Sparkles, Search, ArrowRight } from 'lucide-react';

const TIER_STYLES = {
  MAX: {
    card: 'border-zinc-700/80 bg-zinc-900/90 neon-card-max',
    badge: 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.2)]',
    glow: 'shadow-[0_0_25px_#49EACB]',
    label: 'MAX',
  },
  PRO: {
    card: 'border-zinc-700/80 bg-zinc-900/80 neon-card-pro',
    badge: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]',
    glow: 'shadow-[0_0_15px_#49EACB]',
    label: 'PRO',
  },
  CREATOR: {
    card: 'border-zinc-700/60 bg-zinc-900/70',
    badge: 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/40 shadow-[0_0_6px_rgba(59,130,246,0.15)]',
    glow: '',
    label: 'CREATOR',
  },
  FREE: {
    card: 'border-zinc-800/80 bg-zinc-900/50',
    badge: 'bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30',
    glow: '',
    label: 'FREE',
  },
};

const formatKaspa = (kas) => {
  if (kas == null) return 'N/A';
  return `${kas.toLocaleString(undefined, { maximumFractionDigits: 3 })} KAS`;
};

const truncate = (s, n = 12) =>
  s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-n)}` : s || 'N/A';

const Explorer = () => {
  const [covenants, setCovenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search state
  const [activeTab, setActiveTab] = useState('explore');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/covenants')
      .then(res => res.json())
      .then(data => {
        const list = (Array.isArray(data.covenants) ? data.covenants : []).map(c => ({
          ...c,
          ui_config: c.ui_config || { glow: false, expanded: false, priority: 0, label: 'FREE' },
        }));
        setCovenants(list);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Could not load covenants');
        setLoading(false);
      });
  }, []);

  // ─── Search Handler ──────────────────────────────────────
  const handleSearch = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults(null);

    // Detect if it's a TXID (contains colon like hash:0) or a wallet address
    const isTxId = q.includes(':');
    const isWalletAddr = q.startsWith('kaspatest:') || q.startsWith('kaspa:') || q.length >= 40;

    if (isTxId) {
      // Exact TXID lookup
      fetch(`/api/covenants/${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => {
          if (d.success && d.covenant) {
            setSearchResults({ type: 'covenant', data: [d.covenant] });
          } else {
            setSearchResults({ type: 'covenant', data: [] });
            setSearchError(`No covenant found for TXID: ${q.slice(0, 16)}...`);
          }
          setSearchLoading(false);
        })
        .catch(err => {
          setSearchError(`Search failed: ${err.message}`);
          setSearchLoading(false);
        });
    } else if (isWalletAddr) {
      // Wallet address lookup — fetch all then filter client-side
      fetch('/api/covenants')
        .then(r => r.json())
        .then(d => {
          const all = Array.isArray(d.covenants) ? d.covenants : [];
          const qLower = q.toLowerCase();
          // Match by creator_addr (contains)
          const matches = all.filter(c =>
            c.creator_addr && c.creator_addr.toLowerCase().includes(qLower)
          );
          if (matches.length > 0) {
            setSearchResults({ type: 'wallet', query: q, data: matches });
          } else {
            setSearchResults({ type: 'wallet', query: q, data: [] });
            setSearchError(`No covenants found for wallet: ${q.slice(0, 20)}...`);
          }
          setSearchLoading(false);
        })
        .catch(err => {
          setSearchError(`Search failed: ${err.message}`);
          setSearchLoading(false);
        });
    } else {
      setSearchError('Enter a Kaspa wallet address (kaspatest:...) or covenant TXID (hash:index)');
      setSearchLoading(false);
    }
  };

  return (
    <>
      {/* ═══ HERO SECTION ═══ */}
      <section className="relative z-10 flex flex-col items-center justify-center pt-24 pb-10 px-6 text-center animate-in fade-in duration-700">
        {/* Logo */}
        <div className="mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="none" viewBox="0 0 48 48" className="drop-shadow-[0_0_30px_rgba(73,234,203,0.4)]">
            <defs>
              <filter id="heroGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <linearGradient id="heroG" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#49EACB"/>
                <stop offset="50%" stop-color="#00D2FF"/>
                <stop offset="100%" stop-color="#7e14ff"/>
              </linearGradient>
            </defs>
            <g filter="url(#heroGlow)">
              <line x1="7" y1="10" x2="7" y2="38" stroke="url(#heroG)" stroke-width="1.5" opacity="0.7"/>
              <line x1="7" y1="10" x2="18" y2="6" stroke="url(#heroG)" stroke-width="1" opacity="0.5"/>
              <line x1="18" y1="6" x2="24" y2="12" stroke="url(#heroG)" stroke-width="0.8" opacity="0.4"/>
              <line x1="7" y1="38" x2="18" y2="42" stroke="url(#heroG)" stroke-width="1" opacity="0.5"/>
              <line x1="18" y1="42" x2="24" y2="36" stroke="url(#heroG)" stroke-width="0.8" opacity="0.4"/>
              <circle cx="7" cy="10" r="3" fill="#49EACB"/>
              <circle cx="18" cy="6" r="2" fill="#7e14ff" opacity="0.85"/>
              <circle cx="24" cy="12" r="1.8" fill="#00D2FF" opacity="0.7"/>
              <circle cx="7" cy="24" r="3.2" fill="#00D2FF"/>
              <circle cx="7" cy="38" r="3" fill="#7e14ff"/>
              <circle cx="18" cy="42" r="2" fill="#49EACB" opacity="0.85"/>
              <circle cx="24" cy="36" r="1.8" fill="#00D2FF" opacity="0.7"/>
            </g>
          </svg>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-6 max-w-4xl mx-auto leading-[1.1]">
          Interactive Covenants for <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#49EACB] to-white">The Kaspa BlockDAG</span>
        </h1>

        {/* Subtitle */}
        <p className="text-base md:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-16">
          Covex is the native indexing and deployment layer for SilverScript covenants. Compile, deploy, and interact with programmable UTXOs at 10 blocks per second.
        </p>

        {/* Stats Row */}
        <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-2xl bg-[#0a0a0a]/80 backdrop-blur-md border border-[#1f1f1f] shadow-2xl">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
              <Terminal size={18} />
            </div>
            <div className="text-left">
              <p className="text-xs text-gray-500 font-mono">LANGUAGE</p>
              <p className="text-sm font-semibold text-white">SilverScript</p>
            </div>
          </div>

          <div className="hidden md:block w-px h-10 bg-[#1f1f1f]"></div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
              <Zap size={18} />
            </div>
            <div className="text-left">
              <p className="text-xs text-gray-500 font-mono">SPEED</p>
              <p className="text-sm font-semibold text-white">10 BPS</p>
            </div>
          </div>

          <div className="hidden md:block w-px h-10 bg-[#1f1f1f]"></div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
              <Database size={18} />
            </div>
            <div className="text-left">
              <p className="text-xs text-gray-500 font-mono">INDEXER</p>
              <p className="text-sm font-semibold text-white">Covex Engine</p>
            </div>
          </div>

          <div className="hidden md:block w-px h-10 bg-[#1f1f1f]"></div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#1f1f1f] flex items-center justify-center text-[#49EACB]">
              <Code2 size={18} />
            </div>
            <div className="text-left">
              <p className="text-xs text-gray-500 font-mono">RUNTIME</p>
              <p className="text-sm font-semibold text-white">Toccata</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SCROLL TRANSITION ═══ */}
      <div className="relative z-10 flex flex-col items-center justify-center pb-8">
        <p className="text-xs text-gray-500 font-mono tracking-wider uppercase mb-5">
          Explore Covenants on the Kaspa BlockDAG
        </p>
        <div className="w-px h-8 bg-gradient-to-b from-[#49EACB]/40 to-transparent" />
      </div>

      {/* ═══ TAB SWITCHER ═══ */}
      <div className="relative z-10 max-w-6xl mx-auto px-8">
        <div className="flex items-center gap-0 border-b border-white/5">
          {[
            { id: 'explore', icon: Database, label: 'Explore Covenants' },
            { id: 'search', icon: Search, label: 'Search & Discover' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchResults(null); setSearchError(null); setSearchQuery(''); }}
              className={`px-5 py-3 text-xs font-semibold transition-colors flex items-center gap-2 border-b-2 ${
                activeTab === tab.id
                  ? 'text-[#49EACB] bg-[#49EACB]/[0.04] border-[#49EACB]'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ COVENANT EXPLORER GRID ═══ */}
      <div className="relative z-10 p-8 max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold mb-2 text-white">
          {activeTab === 'search' ? 'Search & Discover' : 'Covenant Explorer'}
        </h2>
        <p className="text-gray-400 mb-8">
          {activeTab === 'search'
            ? 'Paste a wallet address or covenant TXID to find covenants'
            : 'Live covenants on Kaspa Testnet-12 (Toccata)'}
        </p>

        {loading && activeTab === 'explore' && <p className="text-lg text-gray-400">Loading from the BlockDAG…</p>}
        {error && activeTab === 'explore' && <p className="text-red-500">{error}</p>}

        {/* ═══ SEARCH TAB ═══ */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            {/* Search Input */}
            <form onSubmit={handleSearch} className="relative group">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#49EACB]/20 to-[#00D2FF]/10 opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-xl" />
              <div className="relative flex items-center gap-3 p-4 rounded-2xl bg-[#0a0a0a]/90 border border-white/10 focus-within:border-[#49EACB]/40 focus-within:shadow-[0_0_30px_rgba(73,234,203,0.15)] transition-all duration-300">
                <Search size={18} className="text-[#49EACB] shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="kaspatest:qr... or covenant txid (hash:0)"
                  className="flex-1 bg-transparent border-none outline-none text-sm font-mono text-white placeholder:text-gray-600"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={searchLoading || !searchQuery.trim()}
                  className="px-5 py-2 rounded-xl bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold text-xs transition-all shadow-[0_0_15px_rgba(73,234,203,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {searchLoading ? (
                    <span className="inline-block w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <><Search size={12} /> Search</>
                  )}
                </button>
              </div>
            </form>

            {/* Quick examples */}
            <div className="flex flex-wrap gap-2 text-[10px] text-gray-600">
              <span>Try:</span>
              <button onClick={() => { setSearchQuery('kaspatest:'); }} className="px-2 py-0.5 rounded border border-white/5 bg-white/[0.02] hover:border-[#49EACB]/20 hover:text-[#49EACB] transition-colors font-mono">kaspatest:...</button>
              <button onClick={() => { setSearchQuery(':'); }} className="px-2 py-0.5 rounded border border-white/5 bg-white/[0.02] hover:border-[#49EACB]/20 hover:text-[#49EACB] transition-colors font-mono">txid:0</button>
            </div>

            {/* Results */}
            {searchLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
                <div className="w-8 h-8 border-2 border-[#49EACB]/30 border-t-[#49EACB] rounded-full animate-spin" />
                <p className="text-sm font-mono">QUERYING THE BLOCKDAG...</p>
              </div>
            )}

            {searchError && !searchLoading && (
              <div className="p-6 rounded-2xl bg-red-500/[0.04] border border-red-500/20 text-center">
                <p className="text-sm text-red-400 font-mono mb-1">NO RESULTS</p>
                <p className="text-xs text-gray-500">{searchError}</p>
              </div>
            )}

            {searchResults && !searchLoading && searchResults.data.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#49EACB]">
                      {searchResults.type === 'wallet'
                        ? `Found ${searchResults.data.length} covenant${searchResults.data.length !== 1 ? 's' : ''} for wallet`
                        : 'Found covenant'}
                    </span>
                    {searchResults.type === 'wallet' && (
                      <span className="text-[10px] text-gray-500 font-mono truncate max-w-[300px]">
                        {searchResults.query.slice(0, 30)}...
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {searchResults.data.map((c, i) => {
                    const tier = (c.verified_tier || c.tier || 'FREE').toUpperCase();
                    const style = TIER_STYLES[tier] || TIER_STYLES.FREE;
                    const isPremium = tier === 'MAX' || tier === 'PRO';
                    return (
                      <div
                        key={c.tx_id || i}
                        className={`block border rounded-xl p-5 transition-all duration-300 ${
                          style.card
                        } ${isPremium ? 'neon-card-hover hover:-translate-y-0.5' : 'hover:border-emerald-500/30 hover:bg-zinc-900/60'} animate-in fade-in slide-in-from-bottom-4`}
                        style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-bold text-sm truncate ${isPremium ? 'text-[#49EACB]' : 'text-white'}`}>
                              {c.name || c.covenant_type || 'Unnamed Covenant'}
                            </h4>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5 truncate">
                              {c.tx_id ? c.tx_id.slice(0, 20) + '...' : 'N/A'}
                            </p>
                          </div>
                          <span className={`ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full shrink-0 ${style.badge}`}>
                            {style.label}
                          </span>
                        </div>

                        <p className="text-[11px] text-gray-400 mb-3 line-clamp-2">
                          {c.description || c.full_logic_summary || 'No description.'}
                        </p>

                        <div className="grid grid-cols-2 gap-1.5 text-[10px] text-gray-500 mb-3">
                          <span>Category: <span className="text-gray-300">{c.category || 'general'}</span></span>
                          <span>Locked: <span className="text-gray-300">{formatKaspa(c.amount_kaspa)}</span></span>
                          <span>Type: <span className="text-gray-300">{c.covenant_type || 'N/A'}</span></span>
                          <span>DAA: <span className="text-gray-300">{c.block_daa_score?.toLocaleString() || 'N/A'}</span></span>
                        </div>

                        <Link
                          to={`/covenant/${encodeURIComponent(c.tx_id)}`}
                          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-[#49EACB]/10 hover:bg-[#49EACB]/20 border border-[#49EACB]/20 text-[#49EACB] text-[10px] font-bold uppercase tracking-wider transition-all"
                        >
                          View Covenant <ArrowRight size={12} />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ EXPLORE TAB (existing) ═══ */}
        {activeTab === 'explore' && (
          <>
        {!loading && covenants.length === 0 && (
          <div className="border border-zinc-700 bg-zinc-900/50 p-8 rounded-xl text-center">
            <p className="text-xl">No covenants detected yet.</p>
            <p className="text-gray-500 mt-2">
              The Kaspa node is still syncing. Covenants will appear automatically.
            </p>
          </div>
        )}

        {covenants.length > 0 && (
          <>
            {/* Separate paid from free covenants */}
            {(() => {
              const tierRank = { MAX: 3, PRO: 2, CREATOR: 1, FREE: 0 };
              const paidCovenants = covenants
                .filter(c => {
                  const t = (c.verified_tier || c.tier || 'FREE').toUpperCase();
                  return t === 'MAX' || t === 'PRO' || t === 'CREATOR';
                })
                .sort((a, b) => {
                  // Sort by tier priority first, then TVL descending within same tier
                  const aTier = tierRank[(a.verified_tier || a.tier || 'FREE').toUpperCase()] || 0;
                  const bTier = tierRank[(b.verified_tier || b.tier || 'FREE').toUpperCase()] || 0;
                  if (bTier !== aTier) return bTier - aTier;
                  return (b.amount_kaspa || 0) - (a.amount_kaspa || 0);
                });
              const freeCovenants = covenants.filter(c => {
                const t = (c.verified_tier || c.tier || 'FREE').toUpperCase();
                return t === 'FREE';
              });

              return (
                <>
                  {paidCovenants.length > 0 && (
                    <>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-px flex-1 bg-gradient-to-r from-[#49EACB]/30 to-transparent" />
                        <span className="text-xs font-bold text-[#49EACB] uppercase tracking-widest">
                          Featured Covenants
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-l from-[#49EACB]/30 to-transparent" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                        {paidCovenants.map((c, i) => {
                          const tier = (c.verified_tier || c.tier || 'FREE').toUpperCase();
                          const style = TIER_STYLES[tier] || TIER_STYLES.FREE;
                          const isMax = tier === 'MAX';
                          const isPremium = tier === 'MAX' || tier === 'PRO';
                          const isHighTVL = (c.amount_kaspa || 0) >= 100;
                          return (
                            <Link
                              to={`/covenant/${encodeURIComponent(c.tx_id)}`}
                              key={c.tx_id || i}
                              className={`block border rounded-xl p-6 transition-all duration-300 ${style.card} ${
                                isPremium ? 'neon-card-hover hover:-translate-y-0.5' : 'hover:border-emerald-500/30 hover:bg-zinc-900/60'
                              } animate-in fade-in slide-in-from-bottom-4 cursor-pointer relative`}
                              style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
                            >
                              {/* HIGH TVL indicator */}
                              {isHighTVL && (
                                <div className="absolute top-3 right-3 px-2 py-0.5 text-[9px] font-bold rounded-full bg-[#49EACB]/15 border border-[#49EACB]/30 text-[#49EACB] shadow-[0_0_8px_rgba(73,234,203,0.2)]">
                                  HIGH TVL
                                </div>
                              )}
                              {/* Header */}
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <h3 className={`font-bold text-lg ${isPremium ? 'text-[#49EACB]' : 'text-white'}`}>
                                    {c.name || c.covenant_type || 'Unnamed Covenant'}
                                  </h3>
                                  <p className={`text-xs font-mono mt-1 ${isMax ? 'text-[#49EACB]/70' : 'text-gray-500'}`}>
                                    {truncate(c.tx_id, 10)}
                                  </p>
                                </div>
                                <span className={`ml-3 px-3 py-1 text-xs font-semibold rounded-full ${style.badge}`}>
                                  {style.label}
                                </span>
                              </div>

                              {/* Description */}
                              <p className={`text-sm mb-3 ${isMax ? 'text-gray-200' : 'text-gray-400'}`}>
                                {c.description || 'No description provided.'}
                              </p>

                              {/* Trust Badges */}
                              {c.trust_config && (
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                  {(() => {
                                    const tc = c.trust_config;
                                    const hasSource = tc.verified_source_url && tc.verified_source_url.trim().length > 0;
                                    const hasNotes = tc.developer_notes && tc.developer_notes.trim().length > 0;
                                    const hasInteract = (() => {
                                      try {
                                        const schema = typeof tc.interaction_schema === 'string'
                                          ? JSON.parse(tc.interaction_schema || '[]')
                                          : tc.interaction_schema;
                                        return Array.isArray(schema) && schema.length > 0;
                                      } catch (_) { return false; }
                                    })();
                                    return (
                                      <>
                                        {hasSource && (
                                          <a href={tc.verified_source_url} target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full bg-emerald-500/[0.08] border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/[0.15] transition-colors shadow-[0_0_8px_rgba(16,185,129,0.15)]"
                                            title="Verified Open-Source — click to view on GitHub">
                                            <ShieldCheck size={11} />
                                            Verified Open-Source
                                          </a>
                                        )}
                                        {hasNotes && (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full bg-blue-500/[0.08] border border-blue-500/25 text-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.15)]">
                                            <Info size={11} />
                                            Dev Notes
                                          </span>
                                        )}
                                        {hasInteract && (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full bg-purple-500/[0.08] border border-purple-500/25 text-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.15)]">
                                            <Terminal size={11} />
                                            Interactive
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}

                              {/* Custom UI Built badge — only when actual custom HTML from Studio exists */}
                              {c.custom_ui_html && c.custom_ui_html.length > 10 && (
                                <div className="mb-3">
                                  <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-full bg-[#49EACB]/10 border border-[#49EACB]/30 text-[#49EACB] shadow-[0_0_10px_rgba(73,234,203,0.3)] animate-pulse">
                                    <Sparkles size={11} />
                                    CUSTOM BUILT
                                  </span>
                                </div>
                              )}

                              {/* Compact stats */}
                              <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
                                <span>Category: <span className="text-gray-300">{c.category || 'general'}</span></span>
                                <span>Amount: <span className="text-gray-300">{formatKaspa(c.amount_kaspa)}</span></span>
                                <span>Type: <span className="text-gray-300">{c.covenant_type || 'N/A'}</span></span>
                                <span>DAA: <span className="text-gray-300">{c.block_daa_score?.toLocaleString() || 'Unknown'}</span></span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {freeCovenants.length > 0 && (
                    <>
                      {paidCovenants.length > 0 && (
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-px flex-1 bg-gradient-to-r from-gray-700/50 to-transparent" />
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">All Covenants</span>
                          <div className="h-px flex-1 bg-gradient-to-l from-gray-700/50 to-transparent" />
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {freeCovenants.map((c, i) => {
                          const tier = 'FREE';
                          const style = TIER_STYLES[tier];
                          return (
                            <Link
                              to={`/covenant/${encodeURIComponent(c.tx_id)}`}
                              key={c.tx_id || i}
                              className="block border border-zinc-800/80 bg-zinc-900/50 rounded-xl p-6 transition-all duration-300 hover:border-emerald-500/30 hover:bg-zinc-900/60 animate-in fade-in slide-in-from-bottom-4 cursor-pointer"
                              style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <h3 className="font-bold text-lg text-white">{c.name || c.covenant_type || 'Unnamed Covenant'}</h3>
                                  <p className="text-xs font-mono mt-1 text-gray-500">{truncate(c.tx_id, 10)}</p>
                                </div>
                                <span className="ml-3 px-3 py-1 text-xs font-semibold rounded-full bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30">
                                  FREE
                                </span>
                              </div>
                              <p className="text-sm text-gray-400 mb-3">{c.description || 'No description provided.'}</p>
                              <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
                                <span>Category: <span className="text-gray-300">{c.category || 'general'}</span></span>
                                <span>Amount: <span className="text-gray-300">{formatKaspa(c.amount_kaspa)}</span></span>
                                <span>Type: <span className="text-gray-300">{c.covenant_type || 'N/A'}</span></span>
                                <span>DAA: <span className="text-gray-300">{c.block_daa_score?.toLocaleString() || 'Unknown'}</span></span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
        </> 
      )}
      </div>
    </>
  );
};

export default Explorer;
