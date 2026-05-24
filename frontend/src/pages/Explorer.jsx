import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Terminal, Database, Code2, Zap, ChevronDown, ShieldCheck, Globe, ExternalLink, Info, Sparkles } from 'lucide-react';

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

  return (
    <>
      {/* ═══ HERO SECTION ═══ */}
      <section className="relative z-10 flex flex-col items-center justify-center pt-24 pb-10 px-6 text-center animate-in fade-in duration-700">
        {/* Logo */}
        <div className="mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="61" fill="none" viewBox="0 0 48 46" className="drop-shadow-[0_0_20px_rgba(73,234,203,0.3)]">
            <defs>
              <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#49EACB"/>
                <stop offset="100%" stop-color="#7e14ff"/>
              </linearGradient>
            </defs>
            <path d="M22 7L18 11L10 17L8 25L10 33L18 38L22 40" stroke="url(#heroGrad)" stroke-width="1.5" fill="none" opacity="0.6"/>
            <circle cx="22" cy="7" r="2.5" fill="#49EACB" opacity="0.9"/>
            <circle cx="18" cy="11" r="2" fill="#00D2FF" opacity="0.8"/>
            <circle cx="10" cy="17" r="2.5" fill="#49EACB" opacity="0.9"/>
            <circle cx="8" cy="25" r="3" fill="#49EACB"/>
            <circle cx="10" cy="33" r="2.5" fill="#49EACB" opacity="0.9"/>
            <circle cx="18" cy="38" r="2" fill="#00D2FF" opacity="0.8"/>
            <circle cx="22" cy="40" r="2.5" fill="#7e14ff" opacity="0.9"/>
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
        <p className="text-xs text-gray-500 mb-4 font-mono tracking-wider uppercase">
          Explore Covenants on the Kaspa BlockDAG
        </p>
        <div className="flex flex-col items-center gap-1">
          <div className="w-6 h-6 rounded-full border border-[#49EACB]/30 flex items-center justify-center animate-bounce">
            <ChevronDown size={14} className="text-[#49EACB]" />
          </div>
        </div>
      </div>

      {/* ═══ COVENANT EXPLORER GRID ═══ */}
      <div className="relative z-10 p-8 max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold mb-2 text-white">Covenant Explorer</h2>
        <p className="text-gray-400 mb-8">Live covenants on Kaspa Testnet-12 (Toccata)</p>

        {loading && <p className="text-lg text-gray-400">Loading from the BlockDAG…</p>}
        {error && <p className="text-red-500">{error}</p>}

        {!loading && covenants.length === 0 && (
          <div className="border border-zinc-700 bg-zinc-900/50 p-8 rounded-xl text-center">
            <p className="text-xl">No covenants detected yet.</p>
            <p className="text-gray-500 mt-2">
              The Kaspa node is still syncing. Covenants will appear automatically.
            </p>
          </div>
        )}

        {covenants.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {covenants.map((c, i) => {
              const tier = (c.verified_tier || c.tier || 'FREE').toUpperCase();
              const style = TIER_STYLES[tier] || TIER_STYLES.FREE;
              const isMax = tier === 'MAX';
              const isPremium = tier === 'MAX' || tier === 'PRO';

              return (
                <Link
                  to={`/covenant/${c.tx_id}`}
                  key={c.tx_id || i}
                  className={`block border rounded-xl p-6 transition-all duration-300 ${style.card} ${
                    isPremium ? 'neon-card-hover hover:-translate-y-0.5' : 'hover:border-emerald-500/30 hover:bg-zinc-900/60'
                  } animate-in fade-in slide-in-from-bottom-4 cursor-pointer`}
                  style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
                >
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
                              <a
                                href={tc.verified_source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full bg-emerald-500/[0.08] border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/[0.15] transition-colors shadow-[0_0_8px_rgba(16,185,129,0.15)]"
                                title="Verified Open-Source — click to view on GitHub"
                              >
                                <ShieldCheck size={11} />
                                ✓ Verified Open-Source
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

                  {/* Custom UI Built badge */}
                  {c.custom_ui_config && (
                    <div className="mb-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-full bg-[#49EACB]/10 border border-[#49EACB]/30 text-[#49EACB] shadow-[0_0_10px_rgba(73,234,203,0.3)] animate-pulse">
                        <Sparkles size={11} />
                        CUSTOM BUILT
                      </span>
                    </div>
                  )}

                  {/* Compact stats — always shown */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
                    <span>Category: <span className="text-gray-300">{c.category || 'general'}</span></span>
                    <span>Amount: <span className="text-gray-300">{formatKaspa(c.amount_kaspa)}</span></span>
                    <span>Type: <span className="text-gray-300">{c.covenant_type || 'N/A'}</span></span>
                    <span>DAA: <span className="text-gray-300">{c.block_daa_score?.toLocaleString() || 'Unknown'}</span></span>
                  </div>

                  {/* Universal detail section — all tiers show full on-chain data */}
                  <div className={`mt-2 pt-3 border-t ${isPremium ? 'border-[#49EACB]/30' : 'border-zinc-700/40'} space-y-2 text-xs`}>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Script Hash</span>
                      <span className={`font-mono ${isPremium ? 'text-[#49EACB]/80' : 'text-gray-400'}`}>{truncate(c.script_hash, 6)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Creator</span>
                      <span className="text-gray-300 font-mono flex items-center gap-1">
                        {truncate(c.creator_addr, 8)}
                        <button
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(c.creator_addr); }}
                          className="text-[9px] text-gray-600 hover:text-[#49EACB] ml-1"
                          title="Copy creator address"
                        >📋</button>
                      </span>
                    </div>
                    {c.full_logic_summary && (
                      <div className="pt-1">
                        <span className="text-gray-500 block mb-1">Logic Summary</span>
                        <span className="text-gray-400 leading-snug">{c.full_logic_summary}</span>
                      </div>
                    )}
                    {c.receiving_addresses && (() => {
                      try {
                        const addrs = typeof c.receiving_addresses === 'string' ? JSON.parse(c.receiving_addresses) : c.receiving_addresses;
                        if (Array.isArray(addrs) && addrs.length > 0) {
                          return (
                            <div className="pt-1">
                              <span className="text-gray-500 block mb-1">Receiving ({addrs.length})</span>
                              {addrs.slice(0, 3).map((a, j) => (
                                <span key={j} className="text-gray-400 font-mono text-[10px] block truncate">{a}</span>
                              ))}
                              {addrs.length > 3 && <span className="text-gray-600 text-[10px]">+{addrs.length - 3} more</span>}
                            </div>
                          );
                        }
                      } catch (_) {}
                      return null;
                    })()}
                  </div>

                  {/* FREE tier: upgrade hint */}
                  {tier === 'FREE' && (
                    <p className="mt-2 text-[10px] text-gray-600 italic text-center">
                      All covenants show full on-chain data. Upgrade for custom interactive UI.
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default Explorer;
