import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from '../components/ToastContext';
import {
  COVENANT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplatesByCategory,
  getTemplateById
} from '../lib/templates/templates';
import { X, ArrowRight } from 'lucide-react';
import { useWallet } from '../components/WalletContext';

// Stable identity hue per template (no Math.random), seeded purely by id. Mirrors the
// Explorer CovenantCard top-accent vocabulary.
function templateHue(id) {
  const s = String(id || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 360;
}

// Genuine on-chain primitives: their "Use Template" routes UP to the real enforced builder
// (EnforcedDeploy ?kind=) instead of a ZK/oracle sandbox preview, because these ARE
// consensus-enforced by Kaspa and have shipped on-chain redeem builders. Keyed by template.id
// -> the matching EnforcedDeploy KINDS id.
const TEMPLATE_TO_ENFORCED_KIND = {
  'plain-hashlock': 'hashlock',
  'absolute-timelock': 'timelock',
  'relative-timelock-csv': 'relative_timelock',
  'hashlock-htlc': 'htlc',
  'payment-channel': 'channel',
  'dead-man-switch': 'deadman',
  'multisig-nofm': 'multisig',
};
// The same 7 ids, used to give those cards the honest emerald on-chain chip (their
// destination is consensus-enforced, so the violet zk chip would be wrong).
const ON_CHAIN_TEMPLATE_IDS = new Set(Object.keys(TEMPLATE_TO_ENFORCED_KIND));
// Market-class templates route to the real parimutuel market-creation flow, not a generic
// oracle_single sandbox preview. These stay honestly labeled oracle/hybrid (the market is
// settled by conjoined oracle covenants); only the destination changes. Only YES/NO parimutuel
// markets fit that builder; dutch-auction is a different shape and keeps its prior oracle path.
const MARKET_TEMPLATE_IDS = new Set(['binary-prediction-market', 'binary-prediction']);

// Honest enforcement-reality label for a template, derived from its real resolution mode.
// Constitution: ZK and oracle outcomes are verified OFF-CHAIN by the disclosed oracle -
// NEVER trustless, NEVER "on-chain enforced". Games are server-authoritative + oracle-attested.
function templateReality(template) {
  // Genuine on-chain primitives route to the enforced builder; show the emerald on-chain chip
  // (matches the catalog's on-chain treatment), since the destination is consensus-enforced.
  if (ON_CHAIN_TEMPLATE_IDS.has(template?.id)) {
    return { key: 'on-chain', label: 'on-chain', style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  }
  if (template?.category === 'Games') {
    return { key: 'oracle', label: 'oracle-attested', style: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
  }
  let mode;
  try { mode = template?.generateConfig?.('kaspatest:placeholder')?.resolution?.mode; } catch { mode = undefined; }
  if (mode === 'hybrid') return { key: 'hybrid', label: 'hybrid', style: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
  if (mode === 'zk') return { key: 'zk', label: 'zk · oracle-verified', style: 'bg-violet-500/15 text-violet-300 border-violet-500/30' };
  return { key: 'oracle', label: 'oracle-attested', style: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
}

/**
 * Covenant Template Library
 * One-click beautiful, correct covenants.
 */
export default function TemplateLibrary() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [communityTemplates, setCommunityTemplates] = useState([]);
  const [tplSearch, setTplSearch] = useState('');
  const [tplCat, setTplCat] = useState('All');
  const prefersReduced = useReducedMotion();

  // Lightweight load-time stagger for the template grid (drop-in entrance layer; never
  // touches card internals or hover-lift). Disabled under prefers-reduced-motion.
  const gridStagger = useMemo(() => ({
    hidden: {},
    show: { transition: { staggerChildren: prefersReduced ? 0 : 0.04 } },
  }), [prefersReduced]);
  const cardRise = useMemo(() => (prefersReduced
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] } } }
  ), [prefersReduced]);

  const filteredTemplates = selectedCategory === 'All'
    ? COVENANT_TEMPLATES
    : getTemplatesByCategory(selectedCategory);

  // Load real published custom UIs from creators (activates the backend marketplace)
  useEffect(() => {
    fetch('/api/marketplace/templates')
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(data => {
        setCommunityTemplates(data.templates || []);
      })
      .catch(() => setCommunityTemplates([]));
  }, []);

  const handleUseTemplate = (template) => {
    if (!address) {
      toast.error("Please connect your wallet first to use templates.");
      return;
    }

    // Generate the rich starting config and hand it to the sandbox/terminal.
    const config = template.generateConfig(address);
    sessionStorage.setItem('pending_covenant_config', JSON.stringify(config));
    sessionStorage.setItem('selected_template_id', template.id);

    // BUILD UP TO THE CLAIM: genuine on-chain primitives route to the real enforced builder
    // (consensus-enforced, with a shipped on-chain redeem builder), not a ZK/oracle sandbox
    // preview. The destination self-labels them on-chain.
    const enforcedKind = TEMPLATE_TO_ENFORCED_KIND[template.id];
    if (enforcedKind) {
      navigate(`/deploy/enforced?${new URLSearchParams({ kind: enforcedKind, name: template.name }).toString()}`);
      return;
    }
    // Market-class templates land on the real parimutuel market-creation flow rather than a
    // generic oracle_single sandbox preview.
    if (MARKET_TEMPLATE_IDS.has(template.id)) {
      navigate(`/deploy/enforced?${new URLSearchParams({ kind: 'market', name: template.name }).toString()}`);
      return;
    }

    // Games open the live arena explorer; everything else opens the public Sandbox with the
    // matching circuit preloaded (consistent with the official catalog routing). No localStorage
    // tier check here: that was a self-grant hole, and the Sandbox is free to explore while the
    // builder enforces paid access against the backend.
    if (template.category === 'Games') {
      navigate('/'); // the Explorer (live game arenas) is the home route, not /explorer
      return;
    }
    const res = config?.resolution || {};
    const kind = res.mode === 'zk' ? 'zk' : 'oracle';
    const ctype = res.circuit?.type;
    const circuit = (ctype && ctype !== 'custom') ? ctype : (kind === 'zk' ? 'merkle_membership' : 'oracle_single');
    navigate(`/sandbox?${new URLSearchParams({ circuit, kind, name: template.name }).toString()}`);
  };

  const handlePreview = (template) => {
    setSelectedTemplate(template);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white light:text-slate-900 mb-4">Covenant Templates</h1>
        <p className="text-gray-300 light:text-slate-600 max-w-2xl mx-auto">
          Choose a ready-made template. One click loads everything: correct circuit, oracle settings,
          fees, and a beautiful UI. Customize further in Covenant Studio if you want.
        </p>
      </div>

      {/* Category Filter - kaspa-green active treatment (matches Explorer) */}
      <div className="flex flex-wrap gap-2 justify-center mb-10">
        {['All', ...TEMPLATE_CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              selectedCategory === cat
                ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green'
                : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Template Grid - CovenantCard quality bar: top accent bar, hover-lift, reality chip,
          dark gradient surface, group-hover arrow CTA, staggered slide-up entrance. */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
        variants={gridStagger}
        initial="hidden"
        animate="show"
      >
        {filteredTemplates.map(template => {
          const hue = templateHue(template.id);
          const accent = `hsl(${hue} 72% 62%)`;
          const reality = templateReality(template);
          return (
            <motion.div
              key={template.id}
              variants={cardRise}
              className="hover-lift group relative flex flex-col rounded-3xl border border-white/[0.08] overflow-hidden bg-gradient-to-br from-[#15151f] via-[#0e0e16] to-[#0a0a0f] transition-colors duration-300 hover:border-[color:var(--ta)]"
              style={{ '--ta': `hsl(${hue} 74% 60% / 0.55)` }}
            >
              {/* Top accent bar - template identity hue */}
              <div className="h-[3px] w-full shrink-0" aria-hidden="true"
                style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.8 }} />

              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div className="text-4xl">{template.icon}</div>
                  <span className={`shrink-0 text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${reality.style}`}>
                    {reality.label}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-2 leading-tight">{template.name}</h3>
                <p
                  className="text-gray-400 text-sm mb-4 leading-relaxed break-words"
                  style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {template.description}
                </p>

                <div className="flex flex-wrap gap-1 mb-4">
                  {template.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 border border-white/[0.06]">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="text-xs text-gray-500 mb-4">
                  {template.estimatedTime} • {template.recommendedTier} tier recommended
                </div>

                <div className="flex items-center gap-3 mt-auto">
                  <button
                    onClick={() => handlePreview(template)}
                    className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-white/15 text-gray-200 hover:bg-white/5 transition"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => handleUseTemplate(template)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-xl bg-[#49EACB] text-black hover:bg-[#3dd9b8] active:scale-[0.985] transition group-hover:gap-2"
                  >
                    Use Template
                    <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      <CommunityPublished />

      {/* Preview Modal - glass-panel + detail-hero-enhanced + covex-aurora */}
      {selectedTemplate && (() => {
        const reality = templateReality(selectedTemplate);
        const hue = templateHue(selectedTemplate.id);
        return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-6" onClick={() => setSelectedTemplate(null)}>
          <div className="glass-panel detail-hero-enhanced relative overflow-hidden border border-white/10 rounded-3xl max-w-lg w-full p-8" onClick={e => e.stopPropagation()}>
            <div className="covex-aurora" aria-hidden="true" style={{ top: -30, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 340, height: 180, maxWidth: '90vw', opacity: 0.5 }} />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6 gap-3">
                <div>
                  <div className="text-5xl mb-4">{selectedTemplate.icon}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-bold text-white">{selectedTemplate.name}</h2>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${reality.style}`}>{reality.label}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedTemplate(null)} className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors" aria-label="Close"><X size={18} /></button>
              </div>

              <p className="text-gray-300 mb-6 leading-relaxed">{selectedTemplate.description}</p>

              <div className="text-sm space-y-2 mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div><span className="text-gray-400">Category:</span> {selectedTemplate.category}</div>
                <div><span className="text-gray-400">Difficulty:</span> {selectedTemplate.difficulty}</div>
                <div><span className="text-gray-400">Recommended Tier:</span> {selectedTemplate.recommendedTier}</div>
                <div><span className="text-gray-400">Setup Time:</span> {selectedTemplate.estimatedTime}</div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="flex-1 py-3 rounded-xl border border-white/15 text-gray-200 hover:bg-white/5 transition"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setSelectedTemplate(null);
                    handleUseTemplate(selectedTemplate);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#49EACB] text-black font-bold hover:bg-[#3dd9b8] active:scale-[0.985] transition"
                  style={{ boxShadow: `0 16px 40px -20px hsl(${hue} 74% 60% / 0.5)` }}
                >
                  Use This Template <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Official Covex templates from the backend marketplace: a comprehensive, searchable catalog. */}
      {communityTemplates.length > 0 && (() => {
        const cats = ['All', ...Array.from(new Set(communityTemplates.map(t => t.category).filter(Boolean)))];
        const q = tplSearch.trim().toLowerCase();
        const shown = communityTemplates.filter(t =>
          (tplCat === 'All' || t.category === tplCat) &&
          (!q || `${t.name} ${t.description} ${t.category} ${t.id}`.toLowerCase().includes(q))
        );
        // All genuine on-chain primitive kinds reach the free enforced-deploy builder. The
        // two oracle_* kinds are HYBRID (oracle co-signature is consensus-required): routing
        // them here is fine because DeployDisclosure self-labels them hybrid, never trustless.
        const ENFORCED_KINDS = [
          'singlesig', 'hashlock', 'timelock', 'multisig',
          'htlc', 'channel', 'deadman', 'relative_timelock', 'timedecay',
          'oracle_enforced', 'oracle_escrow',
        ];
        const hrefFor = (t) => {
          // Genuine on-chain primitives → the free enforced-deploy builder.
          if (ENFORCED_KINDS.includes(t.kind)) return `/deploy/enforced?kind=${t.kind}`;
          // Games → the live arena explorer (where you stake & play), which is the home route.
          if (t.kind === 'game' || t.category === 'Games') return '/';
          // ZK proofs, oracle markets and advanced patterns → the sandbox with the
          // matching circuit preloaded (real build destination, no more dead-end).
          const p = new URLSearchParams({ circuit: t.id || '', kind: t.kind || '', name: t.name || '' });
          return `/sandbox?${p.toString()}`;
        };
        return (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[2px] text-kaspa-green mb-1">COVEX OFFICIAL · {communityTemplates.length} TEMPLATES</div>
              <h2 className="text-2xl font-bold text-white light:text-slate-900">Official Covenant Templates</h2>
            </div>
            <input
              value={tplSearch}
              onChange={e => setTplSearch(e.target.value)}
              placeholder="Search templates…"
              className="text-sm bg-black/40 light:bg-white border border-white/10 light:border-slate-200 text-white light:text-slate-900 rounded-xl px-3 py-2 w-full sm:w-64 outline-none focus:border-kaspa-green/40"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {cats.map(c => (
              <button key={c} onClick={() => setTplCat(c)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${tplCat === c ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green' : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}>
                {c}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="glass-panel rounded-2xl py-10 text-center border border-white/[0.06]"><p className="text-gray-400 light:text-slate-500 text-sm">No templates match your search.</p></div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((t, idx) => {
              const realityStyle = t.reality === 'on-chain'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : t.reality === 'hybrid'
                ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30';
              const CAT_ICON = { 'P2SH Commitments': '\u{1F512}', 'Atomic Swaps & HTLC': '\u{1F501}', 'Vesting & Timelocks': '\u{23F3}', 'Multi-sig': '\u{1F511}', 'State Channels': '\u{1F517}', 'Games': '\u{1F3AE}', 'ZK Proofs & Claims': '\u{1F52E}', 'Prediction & Markets': '\u{1F4CA}', 'Financial Tools': '\u{1F4B0}', 'Identity & Gating': '\u{1FAAA}', 'Compute & Cross-chain': '⚙️' };
              const icon = CAT_ICON[t.category] || '\u{1F4DC}';
              const hue = (idx * 47 + String(t.id || t.name || '').length * 17) % 360;
              const accent = `hsl(${hue} 72% 62%)`;
              return (
                <div key={t.id || idx}
                  className="hover-lift group relative flex flex-col rounded-3xl border border-white/[0.08] light:border-slate-200 overflow-hidden bg-gradient-to-br from-[#15151f] via-[#0e0e16] to-[#0a0a0f] light:from-white light:via-white light:to-slate-50 transition-colors duration-300 hover:border-[color:var(--ta)]"
                  style={{ '--ta': `hsl(${hue} 74% 60% / 0.55)` }}>
                  <div className="h-[3px] w-full shrink-0" aria-hidden="true"
                    style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.8 }} />
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <div className="text-4xl leading-none">{icon}</div>
                      {t.reality && <span className={`shrink-0 text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${realityStyle}`}>{t.reality}</span>}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1.5 truncate">{t.category || 'Covenant'}</div>
                    <h3 className="text-lg font-bold text-white light:text-slate-900 mb-1.5 leading-tight break-words">{t.name || t.id}</h3>
                    <p className="text-xs text-gray-400 light:text-slate-500 mb-4 leading-relaxed break-words line-clamp-3">{t.description}</p>
                    <a href={hrefFor(t)}
                      className="mt-auto inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#49EACB] text-black text-sm font-bold hover:bg-[#3dd9b8] active:scale-[0.985] transition group-hover:gap-2">
                      Use Template <span aria-hidden="true">&rarr;</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
          )}
          <p className="text-[10px] text-center text-gray-500 mt-4">Showing {shown.length} of {communityTemplates.length} official templates, each labeled with its real on-chain / hybrid / oracle-attested enforcement.</p>
        </div>
        );
      })()}

      <div className="mt-16 text-center text-xs text-gray-500 light:text-slate-500">
        Templates use the official Covex shared configuration protocol.<br />
        All templates are fully compatible with Covenant Studio for further customization.
      </div>
    </div>
  );
}


/** Real published covenant designs from /api/marketplace/templates. */
function CommunityPublished() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch('/api/marketplace/templates')
      .then((r) => r.json())
      // Only genuine community-published covenants (have a covenant_id) belong here; the official
      // Covex templates (id-only) render in the "Official Covenant Templates" section above.
      .then((d) => setItems(Array.isArray(d.templates) ? d.templates.filter((t) => t.covenant_id) : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  return (
    <div className="mt-16">
      <h2 className="text-2xl font-bold text-white light:text-slate-900 mb-2 text-center">Community Published</h2>
      <p className="text-gray-400 light:text-slate-500 text-sm text-center mb-8">Custom covenant designs published by paid creators, live from the marketplace.</p>
      {!loaded ? null : items.length === 0 ? (
        <div className="glass-panel rounded-2xl py-12 text-center border border-white/[0.06]">
          <p className="text-gray-300 light:text-slate-700 text-sm font-semibold mb-1">No community designs published yet</p>
          <p className="text-gray-500 light:text-slate-500 text-xs">Paid creators can publish their covenant page designs from the Studio. The first ones will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((t, i) => (
            <a key={t.covenant_id || i} href={`/covenant/${encodeURIComponent(t.covenant_id)}`} className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-kaspa-green/30 transition-all block">
              <p className="font-bold text-white light:text-slate-900 mb-1 truncate">{t.slug || t.covenant_id}</p>
              <p className="text-xs text-gray-400 light:text-slate-500">Published covenant design</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
