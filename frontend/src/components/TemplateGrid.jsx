import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from './ToastContext';
import {
  COVENANT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplatesByCategory,
} from '../lib/templates/templates';
import { X, ArrowRight } from 'lucide-react';
import { useWallet } from './WalletContext';
import SandboxCircuitPreview from './SandboxCircuitPreview';

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
// Constitution: ZK and oracle outcomes are verified OFF-CHAIN by the external resolver,
// NEVER trustless, NEVER "on-chain enforced". Two-party covenants are server-authoritative + oracle-attested.
function templateReality(template) {
  // Genuine on-chain primitives route to the enforced builder; show the emerald on-chain chip
  // (matches the catalog's on-chain treatment), since the destination is consensus-enforced.
  if (ON_CHAIN_TEMPLATE_IDS.has(template?.id)) {
    return { key: 'on-chain', label: 'on-chain', style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  }
  if (template?.category === 'Two-party covenants') {
    return { key: 'oracle', label: 'oracle-attested', style: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
  }
  let mode;
  try { mode = template?.generateConfig?.('kaspatest:placeholder')?.resolution?.mode; } catch { mode = undefined; }
  if (mode === 'hybrid') return { key: 'hybrid', label: 'hybrid', style: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
  if (mode === 'zk') return { key: 'zk', label: 'zk · oracle-verified', style: 'bg-violet-500/15 text-violet-300 border-violet-500/30' };
  return { key: 'oracle', label: 'oracle-attested', style: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
}

// Map a template's reality key (from templateReality) onto the enforcement-reality
// vocabulary SandboxCircuitPreview understands (its RESOLUTION_FLOW keys). This keeps
// the visual "how it resolves" mini-flow keyed to the SAME honest reality the chip
// shows: on-chain stays on-chain, zk -> full-zk, hybrid stays hybrid, everything
// else -> oracle-attested. No reality is upgraded.
const TEMPLATE_REALITY_TO_CIRCUIT = { 'on-chain': 'on-chain', zk: 'full-zk', hybrid: 'hybrid', oracle: 'oracle-attested' };

// Map a template category onto the circuit category SandboxCircuitPreview uses to
// decide whether a competitive-pool payout simulation is meaningful (POT_CATEGORIES:
// game / defi / oracle). Anything else falls through to a non-pool category.
function templateCircuitCategory(category) {
  if (category === 'Two-party covenants') return 'game';
  if (category === 'Conditional Outcomes') return 'oracle';
  if (category === 'Financial Tools' || category === 'Governance & DAOs') return 'defi';
  return 'other';
}

// Synthesize the minimal circuit object SandboxCircuitPreview needs ({ id, name,
// description, reality, category }) from a TemplateGrid template, so the preview
// modal can render a REAL resolution mini-flow (and, for pot categories, the
// faithful payout simulator) instead of only a metadata spec sheet. The reality is
// taken from the same templateReality() the card chip uses, so the two never diverge.
function templateToCircuit(template) {
  if (!template) return null;
  const reality = TEMPLATE_REALITY_TO_CIRCUIT[templateReality(template).key] || 'oracle-attested';
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    reality,
    category: templateCircuitCategory(template.category),
  };
}

// The `kind` SandboxCircuitPreview expects: 'game' for two-party templates, 'oracle' for
// conditional-outcome templates, otherwise a neutral value. Drives both the simulator
// gating and the declared-logic resolutionMode inside the preview.
function templatePreviewKind(template) {
  if (template?.category === 'Two-party covenants') return 'game';
  if (template?.category === 'Conditional Outcomes') return 'oracle';
  return 'covenant';
}

/**
 * Embeddable Template Grid.
 *
 * Props:
 *   embedded  - if true, omits the in-grid category-filter chrome (host owns layout)
 *               and skips the preview modal (host can wire its own).
 *   onUse     - optional. If provided, called as onUse(template) instead of the default
 *               route. If null/undefined, the standalone-page default routing is used
 *               (enforced builder / conditional-outcome / sandbox / explorer for two-party).
 *   filter    - optional. Either a category string (matches TEMPLATE_CATEGORIES or 'All')
 *               or a function (template) => boolean. When omitted, defaults to showing all.
 */
export default function TemplateGrid({ embedded = false, onUse = null, filter = null }) {
  const navigate = useNavigate();
  const { address } = useWallet();
  const prefersReduced = useReducedMotion();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const gridStagger = useMemo(() => ({
    hidden: {},
    show: { transition: { staggerChildren: prefersReduced ? 0 : 0.04 } },
  }), [prefersReduced]);
  const cardRise = useMemo(() => (prefersReduced
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] } } }
  ), [prefersReduced]);

  // Resolve which templates to show.
  // - If a function `filter` is provided, use it directly (overrides the internal chip row).
  // - If a string `filter` is provided, use it as the fixed category (still hides chips).
  // - Otherwise, render the chip row and use its `selectedCategory` state.
  const filteredTemplates = useMemo(() => {
    if (typeof filter === 'function') return COVENANT_TEMPLATES.filter(filter);
    if (typeof filter === 'string') {
      return filter === 'All' ? COVENANT_TEMPLATES : getTemplatesByCategory(filter);
    }
    return selectedCategory === 'All' ? COVENANT_TEMPLATES : getTemplatesByCategory(selectedCategory);
  }, [filter, selectedCategory]);

  const showCategoryChips = !embedded && filter == null;

  const defaultUse = (template) => {
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

    // Two-party covenants open the live Explorer; everything else opens the public Sandbox with the
    // matching circuit preloaded (consistent with the official catalog routing). No localStorage
    // tier check here: that was a self-grant hole, and the Sandbox is free to explore while the
    // builder enforces paid access against the backend.
    if (template.category === 'Two-party covenants') {
      navigate('/'); // the live Explorer is the home route, not /explorer
      return;
    }
    const res = config?.resolution || {};
    const kind = res.mode === 'zk' ? 'zk' : 'oracle';
    const ctype = res.circuit?.type;
    const circuit = (ctype && ctype !== 'custom') ? ctype : (kind === 'zk' ? 'merkle_membership' : 'oracle_single');
    navigate(`/sandbox?${new URLSearchParams({ circuit, kind, name: template.name }).toString()}`);
  };

  const handleUseTemplate = (template) => {
    if (typeof onUse === 'function') {
      onUse(template);
      return;
    }
    defaultUse(template);
  };

  const handlePreview = (template) => {
    setSelectedTemplate(template);
  };

  return (
    <>
      {showCategoryChips && (
        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {['All', ...TEMPLATE_CATEGORIES].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                selectedCategory === cat
                  ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green'
                  : 'border-white/10 light:border-slate-200 text-gray-400 light:text-slate-500 hover:border-white/20 hover:text-gray-200 light:hover:text-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

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
              className="hover-lift group relative flex flex-col rounded-3xl border border-white/[0.08] light:border-slate-200 overflow-hidden bg-gradient-to-br from-[#15151f] via-[#0e0e16] to-[#0a0a0f] light:from-white light:via-white light:to-slate-50 transition-colors duration-300 hover:border-[color:var(--ta)]"
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

                <h3 className="text-xl font-bold text-white light:text-slate-900 mb-2 leading-tight">{template.name}</h3>
                <p
                  className="text-gray-400 light:text-slate-500 text-sm mb-4 leading-relaxed break-words"
                  style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {template.description}
                </p>

                <div className="flex flex-wrap gap-1 mb-4">
                  {template.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-white/5 light:bg-slate-100 text-gray-400 light:text-slate-500 border border-white/[0.06] light:border-slate-200">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="text-xs text-gray-500 light:text-slate-400 mb-4">
                  {template.estimatedTime} • {template.recommendedTier} tier recommended
                </div>

                <div className="flex items-center gap-3 mt-auto">
                  <button
                    onClick={() => handlePreview(template)}
                    className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-white/15 light:border-slate-200 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition"
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

      {/* Preview Modal - glass-panel + detail-hero-enhanced + covex-aurora. Embedded hosts
          can render their own preview if they need a different surface. Now actually
          visual: it embeds the SandboxCircuitPreview "how it resolves" mini-flow (and,
          for pot categories, the faithful payout simulator), keyed to the same honest
          enforcement reality the card chip shows, so "Preview" stops being a spec sheet. */}
      {!embedded && selectedTemplate && (() => {
        const reality = templateReality(selectedTemplate);
        const hue = templateHue(selectedTemplate.id);
        const circuit = templateToCircuit(selectedTemplate);
        const previewKind = templatePreviewKind(selectedTemplate);
        return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 sm:p-6" onClick={() => setSelectedTemplate(null)}>
          <div className="glass-panel detail-hero-enhanced relative overflow-hidden border border-white/10 light:border-slate-200 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="covex-aurora" aria-hidden="true" style={{ top: -30, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 340, height: 180, maxWidth: '90vw', opacity: 0.5 }} />
            <div className="relative z-10 flex flex-col min-h-0 p-6 sm:p-8">
              <div className="flex justify-between items-start mb-6 gap-3 shrink-0">
                <div>
                  <div className="text-5xl mb-4">{selectedTemplate.icon}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-bold text-white light:text-slate-900">{selectedTemplate.name}</h2>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${reality.style}`}>{reality.label}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedTemplate(null)} className="shrink-0 p-1.5 rounded-lg text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 hover:bg-white/5 light:hover:bg-slate-100 transition-colors" aria-label="Close"><X size={18} /></button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2">
                <p className="text-gray-300 light:text-slate-600 mb-6 leading-relaxed">{selectedTemplate.description}</p>

                {/* Visual preview: the real resolution mini-flow this template lands in. */}
                {circuit && <SandboxCircuitPreview circuit={circuit} kind={previewKind} />}

                <div className="text-sm space-y-2 mb-2 rounded-2xl border border-white/[0.07] light:border-slate-200 bg-white/[0.02] light:bg-slate-50 p-4 text-gray-200 light:text-slate-700">
                  <div><span className="text-gray-400 light:text-slate-500">Category:</span> {selectedTemplate.category}</div>
                  <div><span className="text-gray-400 light:text-slate-500">Difficulty:</span> {selectedTemplate.difficulty}</div>
                  <div><span className="text-gray-400 light:text-slate-500">Recommended Tier:</span> {selectedTemplate.recommendedTier}</div>
                  <div><span className="text-gray-400 light:text-slate-500">Setup Time:</span> {selectedTemplate.estimatedTime}</div>
                </div>
              </div>

              <div className="flex gap-3 mt-6 shrink-0">
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="flex-1 py-3 rounded-xl border border-white/15 light:border-slate-200 text-gray-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 transition"
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
    </>
  );
}
