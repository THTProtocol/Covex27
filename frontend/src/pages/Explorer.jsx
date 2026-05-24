import React, { useEffect, useState } from 'react';
import { Terminal, Database, Code2, Zap, ChevronDown } from 'lucide-react';

const TIER_STYLES = {
  MAX: {
    card: 'shadow-[0_0_15px_#49EACB] border-[#49EACB] bg-zinc-900/90',
    badge: 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/50',
    glow: 'shadow-[0_0_25px_#49EACB]',
    label: 'MAX',
  },
  PRO: {
    card: 'shadow-[0_0_10px_#49EACB] border-[#49EACB] bg-zinc-900/80',
    badge: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50',
    glow: 'shadow-[0_0_15px_#49EACB]',
    label: 'PRO',
  },
  CREATOR: {
    card: 'border-zinc-600 bg-zinc-900/70',
    badge: 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/50',
    glow: '',
    label: 'CREATOR',
  },
  FREE: {
    card: 'border-zinc-700 bg-zinc-900/50',
    badge: 'bg-gray-500/20 text-gray-400',
    glow: '',
    label: 'FREE',
  },
};

const formatKaspa = (kas) => {
  if (kas == null) return '—';
  return `${kas.toLocaleString(undefined, { maximumFractionDigits: 3 })} KAS`;
};

const truncate = (s, n = 12) =>
  s && s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s || '—';

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
        {/* Network Status Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111111] border border-[#1f1f1f] text-gray-400 text-xs font-mono mb-8">
          <div className="w-1.5 h-1.5 rounded-full bg-[#49EACB] shadow-[0_0_8px_#49EACB] animate-pulse" />
          TN-12 LIVE (TOCCATA)
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
        <p className="text-sm text-gray-500 mb-3 animate-pulse">
          ↓ Scroll down to see all Covenants on the Kaspa BlockDAG
        </p>
        <ChevronDown size={24} className="text-[#49EACB]/60 animate-bounce" />
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
                <div
                  key={c.tx_id || i}
                  className={`border rounded-xl p-6 transition-all duration-300 ${style.card} ${
                    isPremium ? 'hover:shadow-[0_0_20px_#49EACB]' : 'hover:border-emerald-500/50'
                  }`}
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

                  {/* Compact stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-1">
                    <span>Category: <span className="text-gray-300">{c.category || 'general'}</span></span>
                    <span>Amount: <span className="text-gray-300">{formatKaspa(c.amount_kaspa)}</span></span>
                  </div>

                  {/* MAX: expanded full-detail view */}
                  {isMax && (
                    <div className="mt-3 pt-3 border-t border-[#49EACB]/30 space-y-2 text-xs animate-in">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Script Hash</span>
                        <span className="text-[#49EACB]/80 font-mono">{truncate(c.script_hash, 6)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Creator</span>
                        <span className="text-gray-300 font-mono">{truncate(c.creator_addr, 8)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Block DAA</span>
                        <span className="text-gray-300">{c.block_daa_score?.toLocaleString() || '—'}</span>
                      </div>
                      {c.covenant_type && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Type</span>
                          <span className="text-gray-300">{c.covenant_type}</span>
                        </div>
                      )}
                      {c.full_logic_summary && (
                        <div className="pt-1">
                          <span className="text-gray-500 block mb-1">Logic Summary</span>
                          <span className="text-gray-300">{c.full_logic_summary}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PRO: partial expanded info */}
                  {tier === 'PRO' && (
                    <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Script Hash</span>
                        <span className="text-amber-300/70 font-mono">{truncate(c.script_hash, 6)}</span>
                      </div>
                      {c.covenant_type && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Type</span>
                          <span className="text-gray-300">{c.covenant_type}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default Explorer;
