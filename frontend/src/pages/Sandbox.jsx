import { useMemo, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Terminal, TerminalSquare, Boxes, ShieldCheck, Radio, Lock,
  ArrowRight, ArrowLeft, Wand2, Cpu, Rocket, LayoutTemplate,
} from 'lucide-react';
import CovexTerminal, { ZK_CIRCUIT_TYPES, resolveCircuit } from '../components/CovexTerminal';
import SandboxCircuitPreview from '../components/SandboxCircuitPreview';
import SandboxGallery from '../components/SandboxGallery';
import CovenantAssistant from '../components/CovenantAssistant';
import SilverTerminal from '../components/SilverTerminal';
import HowThisWorks from '../components/HowThisWorks.jsx';
import EnforcedDeploy from './EnforcedDeploy';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

// Covenant Sandbox: a calm, premium ORCHESTRATOR. It only sequences and frames the existing
// engine, never re-implements its logic. The flow follows the user's exact mental model in three
// named phases: (1) Create the covenant, (2) Choose how it resolves (the oracle / ZK logic),
// (3) Build the page. One focused panel renders at a time with a persistent context bar so a newcomer never
// gets lost, while an expert can jump phases without losing the selection. The non-custodial deploy
// path inside CovexTerminal is untouched; tier gating via /api/paid-status stays intact; template
// deep-links (?circuit=&kind=&name=&desc=) keep working and can land directly in Phase 2.

// Honest enforcement realities. Every ZK reality (full-zk, hybrid) collapses to oracle-attested:
// Kaspa has no on-chain pairing verifier, so a proof is never checked on-chain. on-chain means
// Kaspa P2SH consensus only. accent drives the Card identity bar; badgeVariant drives the Badge.
// We never render a green "ZK on-chain" badge.
const REALITY = {
  'on-chain': {
    label: 'On-chain enforced', accent: '#34d399', badgeVariant: 'on-chain', Icon: ShieldCheck,
    note: 'Consensus-enforced by the Kaspa P2SH commitment. The chain itself guarantees the rules.',
  },
  // These two are defensive: even if a raw full-zk / hybrid reality reaches this page, it renders
  // honestly as oracle-attested (off-chain oracle verify), never as a green ZK on-chain badge.
  'full-zk': {
    label: 'Oracle-attested', accent: '#fbbf24', badgeVariant: 'oracle', Icon: Radio,
    note: 'A real Groth16 proof is verified fail-closed OFF-CHAIN by the disclosed Covex oracle, which gates the consensus-required co-signature. Kaspa has no on-chain pairing verifier, so the proof is never checked on-chain; only the oracle Schnorr co-signature is.',
  },
  hybrid: {
    label: 'Oracle-attested', accent: '#fbbf24', badgeVariant: 'oracle', Icon: Radio,
    note: 'A ZK property proof verified off-chain by the disclosed Covex oracle, which co-signs the outcome. Trust is in the named oracle; the only on-chain check is its Schnorr co-signature.',
  },
  'oracle-attested': {
    label: 'Oracle-attested', accent: '#fbbf24', badgeVariant: 'oracle', Icon: Radio,
    note: 'Resolved by a signed oracle attestation of an off-chain outcome. Trust is in the named oracle, with the payout settled on-chain.',
  },
  decorative: {
    label: 'Metadata', accent: '#9ca3af', badgeVariant: 'metadata', Icon: Lock,
    note: 'A descriptive label only. The chain does not enforce this property; it is metadata attached to the covenant.',
  },
};

// A friendly kind for the preview / simulator gating, derived from the circuit's category.
function kindForCircuit(c) {
  if (!c) return '';
  if (c.category === 'game') return 'game';
  if (c.category === 'oracle' || c.category === 'defi') return 'oracle';
  return 'zk';
}

// The 12 primitive kinds that the EnforcedDeploy builder owns end to end (real signing,
// real broadcast, real covenant id). When the picked circuit matches one of these, Phase 3
// mounts EnforcedDeploy embedded; otherwise we fall back to the broader CovexTerminal which
// covers the long tail of ZK / oracle circuits.
const ENFORCED_DEPLOY_KINDS = new Set([
  'singlesig', 'hashlock', 'timelock', 'multisig', 'htlc', 'channel',
  'deadman', 'relative_timelock', 'timedecay', 'oracle_enforced',
  'oracle_escrow', 'market',
]);

// The three sandbox phases in the 5-step model. The website / page step lives in
// /covenant/:id/studio after deploy, so it is intentionally not in this array.
// One source of truth for ?phase= persistence and the bottom CTA.
const PHASES = [
  { id: 'create', n: 1, label: 'Create', Icon: Wand2 },
  { id: 'logic', n: 2, label: 'Choose how it resolves', Icon: Cpu },
  { id: 'deploy', n: 3, label: 'Deploy', Icon: TerminalSquare },
];

// Phase 1 information architecture: three intentional, equal entry points. Persisted via ?tab=
// so a deep link can land anywhere. Assistant is the default. Templates is a curated 6-card grid
// of the most popular starting points; Catalog is the full circuit set.
const CREATE_TABS = [
  { id: 'assistant', label: 'Assistant', Icon: Wand2 },
  { id: 'templates', label: 'Templates', Icon: LayoutTemplate },
  { id: 'catalog', label: 'Catalog', Icon: Boxes },
];

// The curated 6-card Templates set. Hand-picked across honest realities so a newcomer sees one
// of each kind they can actually start from: an oracle market, two real-Groth16 ZK circuits
// verified fail-closed by the disclosed Covex oracle, a parimutuel game, age-gating, and a
// verifiable pot split. All six are present in ZK_CIRCUIT_TYPES and land in Phase 2 on click.
const TEMPLATE_IDS = [
  'prediction_market', 'merkle_membership', 'escrow_2party',
  'chess_blitz', 'age_verification', 'pot_distribution',
];

// Reduced-motion-safe cross-fade between phase panels (the y offset is dropped when reduced).
const PANEL_FADE = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } },
};

// Persistent context indicator: the selected circuit + its honest reality badge. Used in the
// sticky stepper rail and reused in the bottom action bar. Hoisted to module scope.
function SelectionChip({ name, reality, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 min-w-0 max-w-full ${className}`}>
      <Boxes size={13} className="text-gray-400 light:text-slate-500 shrink-0" />
      <span className="text-[12px] font-semibold text-white light:text-slate-900 truncate">{name}</span>
      <Badge variant={reality.badgeVariant} dot className="hidden sm:inline shrink-0 text-[10px] py-0">{reality.label}</Badge>
    </span>
  );
}

// Restates the single next step at the top of every phase, driving the literal
// "Create -> Add logic -> Add a website" sentence model. Hoisted to module scope.
function PhaseHeader({ eyebrow, title, action }) {
  return (
    <div>
      <div className="label-xs text-kaspa-green mb-1">{eyebrow}</div>
      <h2 className="text-2xl sm:text-[28px] font-extrabold tracking-[-0.015em] leading-tight text-white light:text-slate-900">{title}</h2>
      <p className="text-[15px] text-gray-300 light:text-slate-600 mt-1.5 max-w-2xl">{action}</p>
    </div>
  );
}

export default function Sandbox() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();

  // Initial selection: from a template deep-link (?circuit=), else NOTHING selected. The create
  // flow must not pre-select a covenant kind (in particular it must not default to a prediction
  // market); the user actively picks one. The phase panels + reachability already handle a null
  // selection (the logic/deploy panels show "Pick a covenant first" and Continue is disabled).
  const [selectedId, setSelectedId] = useState(() => {
    const raw = params.get('circuit');
    const resolved = raw ? resolveCircuit(raw, params.get('kind') || '') : null;
    return (resolved && ZK_CIRCUIT_TYPES.some((c) => c.id === resolved)) ? resolved : null;
  });
  // Template / assistant name only applies to the very first (deep-linked) selection.
  const [tplName, setTplName] = useState(() => params.get('name') || '');
  // Deep-links carrying a name or desc (a template or an assistant pick) land directly in Phase 2.
  // ?phase= persists the current step; an explicit value wins over the deep-link heuristic.
  const [phase, setPhaseState] = useState(() => {
    const explicit = params.get('phase');
    if (explicit && PHASES.some((p) => p.id === explicit)) return explicit;
    const raw = params.get('circuit');
    const hasContext = !!(params.get('name') || params.get('desc'));
    return raw && hasContext ? 'logic' : 'create';
  });
  const setPhase = (id) => {
    setPhaseState(id);
    const next = new URLSearchParams(params);
    if (id && id !== 'create') next.set('phase', id); else next.delete('phase');
    setParams(next, { replace: true });
  };
  // Workspace mode: 'guided' (Covex helps you build) or 'pro' (raw SilverScript terminal, no
  // auto-fill). Persisted in the URL so a pro can bookmark or deep-link straight into the terminal.
  const [mode, setModeState] = useState(() => (params.get('mode') === 'pro' ? 'pro' : 'guided'));
  const setMode = (m) => {
    setModeState(m);
    const next = new URLSearchParams(params);
    if (m === 'pro') next.set('mode', 'pro'); else next.delete('mode');
    setParams(next, { replace: true });
  };
  // Phase-1 tab persistence. ?tab=templates|catalog lands a newcomer directly on either entry
  // point; default Assistant matches the first-load eyebrow promise. Tab state is independent of
  // ?phase= so a deep link can both pick a tab and a phase without one clobbering the other.
  const [createTab, setCreateTabState] = useState(() => {
    const t = params.get('tab');
    return CREATE_TABS.some((x) => x.id === t) ? t : 'assistant';
  });
  const setCreateTab = (id) => {
    setCreateTabState(id);
    const next = new URLSearchParams(params);
    if (id && id !== 'assistant') next.set('tab', id); else next.delete('tab');
    setParams(next, { replace: true });
  };

  const circuit = useMemo(() => ZK_CIRCUIT_TYPES.find((c) => c.id === selectedId) || null, [selectedId]);
  // The Templates tab reuses SandboxGallery against this filtered subset, so styling, badges, and
  // selection wiring stay identical to the Catalog. Order matches TEMPLATE_IDS for visual rhythm.
  const templateCircuits = useMemo(() => {
    const byId = new Map(ZK_CIRCUIT_TYPES.map((c) => [c.id, c]));
    return TEMPLATE_IDS.map((id) => byId.get(id)).filter(Boolean);
  }, []);
  const kind = kindForCircuit(circuit);
  const reality = circuit ? (REALITY[circuit.reality] || REALITY['oracle-attested']) : null;

  const select = (id) => {
    setSelectedId(id);
    setTplName(''); // a manual pick supersedes the template's name
    const c = ZK_CIRCUIT_TYPES.find((x) => x.id === id);
    const next = new URLSearchParams(params);
    next.set('circuit', id);
    next.set('kind', kindForCircuit(c));
    next.delete('name');
    next.delete('desc');
    setParams(next, { replace: true });
  };

  // The assistant's "Use this" is an explicit intent: jump straight to Add-logic, carrying the
  // suggested name + reasoning so the context chip and builder open pre-named and described.
  const useAndConfigure = (id, meta) => {
    setSelectedId(id);
    setTplName(meta?.name || '');
    const c = ZK_CIRCUIT_TYPES.find((x) => x.id === id);
    const next = new URLSearchParams(params);
    next.set('circuit', id);
    next.set('kind', kindForCircuit(c));
    if (meta?.name) next.set('name', meta.name); else next.delete('name');
    if (meta?.desc) next.set('desc', String(meta.desc).slice(0, 280)); else next.delete('desc');
    setParams(next, { replace: true });
    setPhase('logic');
  };

  const phaseIdx = PHASES.findIndex((p) => p.id === phase);
  // Reachability: Add-logic and Interactive-UI require a selection.
  const reachable = (i) => i === 0 || !!circuit;
  const goForward = () => {
    const next = PHASES[Math.min(phaseIdx + 1, PHASES.length - 1)];
    if (reachable(PHASES.findIndex((p) => p.id === next.id))) setPhase(next.id);
  };
  const goBack = () => setPhase(PHASES[Math.max(phaseIdx - 1, 0)].id);

  const name = tplName || circuit?.name || '';
  const panelMotion = prefersReduced
    ? { initial: false, animate: false }
    : { variants: PANEL_FADE, initial: 'hidden', animate: 'show', exit: 'hidden' };

  // Reusable empty state for phases reached without a selection (defensive; reachability gates it).
  const emptyState = (
    <div className="relative z-10 text-center text-sm text-gray-400 light:text-slate-500 py-16">
      Pick a covenant first.{' '}
      <button onClick={() => setPhase('create')} className="text-kaspa-green hover:underline font-semibold">
        Go to create
      </button>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 relative">
      <div className="covex-aurora hidden sm:block" style={{ top: 48, left: -30, width: 420, height: 260 }} aria-hidden="true" />

      {/* HEADER */}
      <div className="relative z-10">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Terminal size={22} className="text-kaspa-green" />
          <h1 className="h-page text-white light:text-slate-900">Covenant Sandbox</h1>
          <Badge variant="glass" dot>Free to explore, wallet only for deploy</Badge>
        </div>
        <p className="text-sm sm:text-lg text-gray-300 light:text-slate-600 max-w-3xl mb-4 sm:mb-7">
          Build a real Kaspa covenant.<span className="hidden sm:inline"> Exploring and simulating is free and needs no wallet; deploying and the advanced editor unlock with a tier.</span>
        </p>
      </div>

      {/* HERO CTA: one obvious primary action on first paint. Pro terminal demoted to a ghost link
          below so newcomers are not asked to make a paralysis decision before they know what a
          covenant is. Selecting either path still mutates ?mode= so deep-links keep working. */}
      {mode === 'guided' && (
        <div className="relative z-10 mb-6">
          <Card accent="#49EACB" className="overflow-hidden">
            <span
              aria-hidden="true"
              className="absolute -top-16 -right-12 w-72 h-48 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(closest-side, #49EACB40, transparent 70%)', filter: 'blur(10px)', opacity: 0.7 }}
            />
            <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
              <span className="p-3 rounded-xl shrink-0 border self-start" style={{ background: '#49EACB1f', borderColor: '#49EACB4d' }}>
                <Wand2 size={26} style={{ color: '#49EACB' }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <Badge variant="builder" dot className="text-[10px] py-0">Recommended</Badge>
                  <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border" style={{ color: '#49EACB', borderColor: '#49EACB66' }}>For everyone</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white light:text-slate-900 leading-tight">
                  Start a guided build
                </h2>
                <p className="text-sm text-gray-400 light:text-slate-500 leading-snug mt-1.5 max-w-xl">
                  Describe what you want or pick a template. Covex walks you through create, logic, and a website, step by step.
                </p>
              </div>
              <Button
                variant="kaspa"
                size="lg"
                shimmer
                onClick={() => setPhase('create')}
                className="shrink-0 self-start sm:self-center"
              >
                Start guided build
                <ArrowRight size={18} className="ml-1" />
              </Button>
            </div>
          </Card>
          <div className="mt-3 flex justify-center sm:justify-start">
            <button
              type="button"
              onClick={() => setMode('pro')}
              className="inline-flex items-center gap-2 text-xs text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors"
            >
              <TerminalSquare size={14} />
              Prefer to write it yourself? Open the pro terminal
              <ArrowRight size={12} className="opacity-60" />
            </button>
          </div>
        </div>
      )}

      {mode === 'pro' && (
        <div className="relative z-10 mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setMode('guided')}
            className="inline-flex items-center gap-2 text-xs text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors"
          >
            <Wand2 size={14} />
            Back to guided build
          </button>
        </div>
      )}

      {mode === 'pro' && (
        <div className="relative z-10">
          <SilverTerminal />
        </div>
      )}

      {mode === 'guided' && (<>
      {/* 5-step rail is rendered globally in App.jsx; no per-page mount here to
          avoid stacking two rails (the global one under the nav + an in-page copy). */}
      {circuit && reality && (
        <div className="relative z-10 mb-4 flex items-center justify-end">
          <SelectionChip name={name} reality={reality} />
        </div>
      )}

      {/* ONE PHASE PANEL AT A TIME */}
      <AnimatePresence mode="wait">
        <motion.div key={phase} {...panelMotion} className="relative z-10 min-w-0 pb-24 sm:pb-20">

          {/* PHASE 1 - CREATE. Three intentional, equal entry points (Assistant / Templates /
              Catalog) above one shared content surface. The ToolsPalette sidebar belongs to the
              Studio context in Phase 2 and is intentionally not mounted here. */}
          {phase === 'create' && (
            <div className="space-y-7 min-w-0">
              <PhaseHeader eyebrow={circuit && name ? `Building ${name}` : 'New covenant'} title="Create the covenant" action="Start from an idea, a template, or the full catalog." />
              <HowThisWorks
                title="What is a covenant?"
                summary="A small program that locks Kaspa funds until rules are satisfied."
                details={(
                  <p>
                    Covex compiles your covenant DSL into a Kaspa redeem script. Funds lock to its P2SH commitment.
                    Some redeem paths are consensus-enforced by Kaspa alone; oracle paths require the disclosed
                    Covex oracle to co-sign, which is the off-chain reality for ZK and parimutuel circuits.
                  </p>
                )}
              />
              {/* Segmented tab control. role=tablist + role=tab keep this keyboard + screen-reader
                  honest. The active tab gets the kaspa-green underline + text-kaspa-green per brief. */}
              <Card className="overflow-hidden">
                <div role="tablist" aria-label="Create entry points" className="grid grid-cols-3">
                  {CREATE_TABS.map((t) => {
                    const Icon = t.Icon;
                    const active = createTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-controls={`create-tab-${t.id}`}
                        id={`create-tab-btn-${t.id}`}
                        onClick={() => setCreateTab(t.id)}
                        className={`relative flex items-center justify-center gap-2 px-3 py-3 text-[13px] sm:text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-kaspa-green/60 ${
                          active
                            ? 'text-kaspa-green bg-white/[0.02] light:bg-white'
                            : 'text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900'
                        }`}
                      >
                        <Icon size={15} className="shrink-0" />
                        <span className="truncate">{t.label}</span>
                        <span
                          aria-hidden="true"
                          className={`absolute inset-x-3 bottom-0 h-[2px] rounded-full transition-opacity ${
                            active ? 'bg-kaspa-green opacity-100' : 'opacity-0'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </Card>
              {/* Shared content surface. One tab body mounts at a time so heavy children (the full
                  catalog) only render when requested. */}
              <div
                id={`create-tab-${createTab}`}
                role="tabpanel"
                aria-labelledby={`create-tab-btn-${createTab}`}
                className="min-w-0"
              >
                {createTab === 'assistant' && (
                  <CovenantAssistant circuits={ZK_CIRCUIT_TYPES} onSelect={useAndConfigure} />
                )}
                {createTab === 'templates' && (
                  <SandboxGallery circuits={templateCircuits} selectedId={selectedId} onSelect={select} />
                )}
                {createTab === 'catalog' && (
                  <SandboxGallery circuits={ZK_CIRCUIT_TYPES} selectedId={selectedId} onSelect={select} />
                )}
              </div>
            </div>
          )}

          {/* PHASE 2 - ADD LOGIC */}
          {phase === 'logic' && (circuit && reality ? (
            <div className="space-y-4 min-w-0">
              <PhaseHeader eyebrow={circuit && name ? `Building ${name}` : 'New covenant'} title="Choose how it resolves" action="See exactly what the chain enforces and who decides the outcome, then tune it." />
              <HowThisWorks
                title="What does 'how it resolves' mean?"
                summary="This decides who or what can settle the covenant: the chain alone, the disclosed Covex oracle, or a mix."
                details={(
                  <p>
                    On-chain enforced means the Kaspa script alone decides. Oracle co-signed means the disclosed Covex
                    oracle attests the off-chain outcome and co-signs the payout transaction. Full-ZK circuits collapse
                    to oracle co-signed because Kaspa has no on-chain pairing verifier.
                  </p>
                )}
              />
              <Card accent={reality.accent} className="overflow-hidden">
                <div className="px-5 py-4 flex flex-wrap items-center gap-3">
                  <Boxes size={18} className="text-kaspa-green" />
                  <span className="text-xs uppercase tracking-widest text-gray-400 light:text-slate-500">Selected</span>
                  <span className="text-white light:text-slate-900 font-semibold">{name}</span>
                  <Badge variant={reality.badgeVariant} dot className="ml-auto">{reality.label}</Badge>
                </div>
                <div className="px-5 pb-4 grid md:grid-cols-3 gap-4 text-sm">
                  <div className="md:col-span-2 min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-500 mb-1">Circuit</div>
                    <div className="text-white light:text-slate-900 font-mono text-xs mb-2 break-all">{circuit.id}</div>
                    <p className="text-gray-300 light:text-slate-600 leading-relaxed">{circuit.description}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-500 mb-1">What enforcement means</div>
                    <p className="text-gray-300 light:text-slate-600 text-xs leading-relaxed">{reality.note}</p>
                  </div>
                </div>
              </Card>
              <SandboxCircuitPreview key={circuit.id} circuit={circuit} kind={kind} />
            </div>
          ) : emptyState)}

          {/* PHASE 3 - DEPLOY (the real builder). The page / website step lives in /covenant/:id/studio. */}
          {phase === 'deploy' && (circuit ? (
            <div className="space-y-5 min-w-0">
              <PhaseHeader eyebrow={circuit && name ? `Building ${name}` : 'New covenant'} title="Deploy" action="Sign the funding transaction in your wallet to create the covenant." />
              {/* Universal signing honesty banner. The single most important truth in the flow:
                  the user's wallet signs, Covex never holds the key. Always visible, never tucked
                  inside a collapsed details element. */}
              <div className="rounded-xl border border-kaspa-green/30 bg-kaspa-green/[0.04] light:bg-emerald-50 px-4 py-3 flex items-start gap-2.5">
                <ShieldCheck size={16} className="text-kaspa-green mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-bold text-white light:text-slate-900">Your wallet signs this. Covex never holds your key.</div>
                  <div className="text-gray-400 light:text-slate-600 mt-0.5">The funding tx broadcasts to a Kaspa node and the covenant id is the resulting P2SH address.</div>
                </div>
              </div>
              {/* THE REAL BUILDER. EnforcedDeploy owns the 12 primitive kinds end to end (signing,
                  broadcast, covenant id). On a successful deploy it hands back the new covenant id
                  and we open Studio with ?fresh=1 so the page starts empty. Everything outside that
                  set still falls back to CovexTerminal, which owns the long-tail ZK / oracle circuits
                  plus its own tier gating and Studio handoff. */}
              {ENFORCED_DEPLOY_KINDS.has(selectedId) ? (
                <EnforcedDeploy
                  embedded
                  onDeployed={(covenantId) => navigate('/covenant/' + covenantId + '/studio?fresh=1')}
                />
              ) : (
                <CovexTerminal externalCircuit={selectedId} />
              )}
              {/* Post-deploy nudge. Moved BELOW the builder so it's a next-step pointer, not a
                  pre-deploy primer that buries the signing banner. */}
              <Card hover accent="#49EACB" className="p-5">
                <div className="flex items-start gap-4">
                  <span className="p-2.5 rounded-xl bg-[#49EACB]/15 border border-[#49EACB]/30 shrink-0">
                    <Rocket size={20} className="text-[#49EACB]" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white light:text-slate-900">After deploy: design the public page in Studio</h3>
                    <p className="text-xs text-gray-400 light:text-slate-500 mt-1 leading-relaxed">
                      The visual Studio (drag and drop, safe platform components only) binds to the new covenant id.
                      Once the funding tx confirms, Studio opens automatically; you can also reach it later from your
                      covenant page at /covenant/:id/studio or from the builder's Custom UI Integration section.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="glass" size="sm" onClick={() => navigate('/templates')}>Browse templates</Button>
                      <Button variant="ghost" size="sm" onClick={() => setPhase('logic')}>
                        <ArrowLeft size={14} /> Back to logic
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ) : emptyState)}

        </motion.div>
      </AnimatePresence>

      {/* PERSISTENT BOTTOM ACTION BAR. Hidden on phase 'deploy' where CovexTerminal owns the deploy CTA. */}
      {phase !== 'deploy' && (
        <div
          className="static sm:sticky z-20 mt-6 flex flex-wrap sm:flex-nowrap sm:items-center sm:justify-between gap-4 gap-y-2 rounded-2xl glass-panel border border-kaspa-green/30 px-5 py-3.5"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="min-w-0 flex items-center gap-2">
            {phase !== 'create' && (
              <Button variant="ghost" size="sm" onClick={goBack} className="shrink-0">
                <ArrowLeft size={14} /> Back
              </Button>
            )}
            {circuit && (
              <span className="text-sm text-gray-300 light:text-slate-600 truncate">
                <span className="hidden sm:inline text-gray-500">Selected: </span>
                <span className="font-semibold text-white light:text-slate-900">{name}</span>
              </span>
            )}
          </div>
          <Button
            variant="kaspa"
            shimmer
            className="shrink-0 w-full sm:w-auto"
            disabled={!circuit}
            onClick={goForward}
          >
            <span className="sm:hidden">Continue</span>
            <span className="hidden sm:inline">
              {phase === 'create' ? 'Continue to logic' : 'Continue to deploy'}
            </span>
            <ArrowRight size={15} />
          </Button>
        </div>
      )}

      <div className="mt-8 text-center text-xs text-gray-500 light:text-slate-400">
        Or browse ready-made starting points in the <Link to="/templates" className="text-kaspa-green hover:underline">template library</Link>.
      </div>
      </>)}
    </div>
  );
}
