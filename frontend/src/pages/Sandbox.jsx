import { useMemo, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Terminal, TerminalSquare, Boxes, ShieldCheck, Radio, Lock, Check, ChevronDown,
  ArrowRight, ArrowLeft, Wand2, Cpu, Rocket,
} from 'lucide-react';
import CovexTerminal, { ZK_CIRCUIT_TYPES, resolveCircuit } from '../components/CovexTerminal';
import SandboxCircuitPreview from '../components/SandboxCircuitPreview';
import SandboxGallery from '../components/SandboxGallery';
import CovenantAssistant from '../components/CovenantAssistant';
import SilverTerminal from '../components/SilverTerminal';
import BuildStepsRail from '../components/BuildStepsRail.jsx';
import HowThisWorks from '../components/HowThisWorks.jsx';
import ToolsPalette from '../components/ToolsPalette.jsx';
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

// The bold entry choice: Guided (Covex helps you build) vs Pro (you write the covenant
// yourself in the terminal, no auto-fill). Hoisted to module scope. Guided is the
// recommended primary, marked with a kaspa Badge chip and a brighter aurora wash; Pro is
// a calmer secondary with reduced surface emphasis.
function ModeCard({ active, onClick, Icon, accent, tag, title, desc, recommended = false, auroraBright = false, secondary = false }) {
  const bgIdle = secondary
    ? 'bg-white/[0.01] light:bg-white/60'
    : 'bg-white/[0.015] light:bg-white/70';
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`hover-lift group relative text-left rounded-2xl border p-5 sm:p-6 transition-all overflow-hidden ${
        active
          ? 'border-white/0 bg-white/[0.04] light:bg-white shadow-[0_20px_60px_-28px_var(--glow)]'
          : `border-white/10 light:border-slate-200 ${bgIdle} hover:border-white/25 light:hover:border-slate-300`
      }`}
      style={{ '--glow': `${accent}66`, ...(active ? { boxShadow: `0 0 0 1.5px ${accent}, 0 20px 60px -28px ${accent}88` } : {}) }}
    >
      {auroraBright && (
        <span
          aria-hidden="true"
          className="absolute -top-12 -right-10 w-56 h-40 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(closest-side, ${accent}40, transparent 70%)`, filter: 'blur(8px)', opacity: active ? 0.9 : 0.55 }}
        />
      )}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: active ? 1 : (secondary ? 0.3 : 0.5) }} />
      <div className="relative flex items-center gap-3">
        <span className="p-2.5 rounded-xl shrink-0 border" style={{ background: `${accent}1f`, borderColor: `${accent}4d` }}>
          <Icon size={22} style={{ color: accent }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-extrabold text-white light:text-slate-900">{title}</span>
            {recommended && (
              <Badge variant="builder" dot className="text-[10px] py-0">Recommended</Badge>
            )}
            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border" style={{ color: accent, borderColor: `${accent}66` }}>{tag}</span>
          </div>
          <p className="text-[12.5px] text-gray-400 light:text-slate-500 leading-snug mt-1">{desc}</p>
        </div>
        {active && <Check size={18} className="ml-auto shrink-0" style={{ color: accent }} />}
      </div>
    </button>
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

  const circuit = useMemo(() => ZK_CIRCUIT_TYPES.find((c) => c.id === selectedId) || null, [selectedId]);
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
          <Badge variant="gold" dot>FREE TO EXPLORE</Badge>
        </div>
        <p className="text-base sm:text-lg text-gray-300 light:text-slate-600 max-w-3xl mb-7">
          Build a real Kaspa covenant. Choose your path: let Covex guide you, or write it yourself in the pro
          terminal. Exploring and simulating is free and needs no wallet; deploy and the advanced editor unlock with a
          tier. Nothing here overstates what the chain enforces.
        </p>
      </div>

      {/* MODE SELECTOR: Guided is the recommended primary; Pro stays a calmer secondary. */}
      <div className="relative z-10 grid sm:grid-cols-[6fr_4fr] gap-4 sm:gap-5 mb-10">
        <ModeCard
          active={mode === 'guided'} onClick={() => setMode('guided')} Icon={Wand2} accent="#49EACB" tag="For everyone"
          title="Guided build"
          desc="Describe what you want or pick a template. Covex helps you build it step by step: create, then logic, then a website."
          recommended
          auroraBright
        />
        <ModeCard
          active={mode === 'pro'} onClick={() => setMode('pro')} Icon={TerminalSquare} accent="#94a3b8" tag="For experienced builders"
          title="Pro terminal"
          desc="Write the covenant yourself and compile it. No templates, no assistant, no auto-fill. Just you and the terminal."
          secondary
        />
      </div>

      {mode === 'pro' && (
        <div className="relative z-10">
          <SilverTerminal />
        </div>
      )}

      {mode === 'guided' && (<>
      {/* Global 5-step rail. Behavior-compatible: BuildStepsRail returns null when not applicable. */}
      <div className="relative z-30 mb-5">
        <BuildStepsRail />
      </div>
      {circuit && reality && (
        <div className="relative z-10 mb-4 flex items-center justify-end">
          <SelectionChip name={name} reality={reality} />
        </div>
      )}

      {/* ONE PHASE PANEL AT A TIME */}
      <AnimatePresence mode="wait">
        <motion.div key={phase} {...panelMotion} className="relative z-10 min-w-0 pb-24 sm:pb-20">

          {/* PHASE 1 - CREATE */}
          {phase === 'create' && (
            <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
              <aside className="hidden lg:block min-w-0">
                <ToolsPalette context="logic" />
              </aside>
              <div className="space-y-7 min-w-0">
                <PhaseHeader eyebrow="Step 1" title="Create the covenant" action="Start from an idea, a template, or code." />
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
                <CovenantAssistant circuits={ZK_CIRCUIT_TYPES} onSelect={useAndConfigure} />
                {/* Progressive disclosure: the full 170+ catalog mounts only when opened. */}
                <details className="group rounded-2xl border border-white/10 light:border-slate-200 bg-black/20 light:bg-white open:bg-transparent">
                  <summary className="cursor-pointer list-none flex items-center gap-2 px-4 py-3 text-[11px] uppercase tracking-widest text-gray-400 light:text-slate-500">
                    <Boxes size={13} className="text-kaspa-green" /> Browse the full catalog (170+ covenants)
                    <ChevronDown size={14} className="ml-auto transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="p-4 pt-0">
                    <SandboxGallery circuits={ZK_CIRCUIT_TYPES} selectedId={selectedId} onSelect={select} />
                  </div>
                </details>
              </div>
            </div>
          )}

          {/* PHASE 2 - ADD LOGIC */}
          {phase === 'logic' && (circuit && reality ? (
            <div className="space-y-4 min-w-0">
              <PhaseHeader eyebrow="Step 2" title="Choose how it resolves" action="See exactly what the chain enforces and who decides the outcome, then tune it." />
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
              <PhaseHeader eyebrow="Step 3" title="Deploy" action="Sign the funding transaction in your wallet. The page step opens in /covenant/:id/studio after a successful deploy." />
              {/* Honest Studio explainer. No fake reward, no fake deployed id, no decoder pre-deploy. */}
              <Card hover accent="#49EACB" className="p-5">
                <div className="flex items-start gap-4">
                  <span className="p-2.5 rounded-xl bg-[#49EACB]/15 border border-[#49EACB]/30 shrink-0">
                    <Rocket size={20} className="text-[#49EACB]" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white light:text-slate-900">Deploy, then design the public page in Studio</h3>
                    <p className="text-xs text-gray-400 light:text-slate-500 mt-1 leading-relaxed">
                      The visual Studio (drag and drop, safe platform components only) binds to a deployed covenant id.
                      Sign the funding transaction in the builder below, then open Covenant Studio from the builder's
                      Custom UI Integration section or from your covenant page at /covenant/:id/studio. Markets and game
                      covenants get their full custom-UI page this way.
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
              {/* Universal signing explainer. Stays above the form on every primitive so the user
                  always sees the honest reality before approving anything in their wallet. */}
              <HowThisWorks
                title="Why am I signing this?"
                summary="Your wallet signs the funding transaction. Covex never holds your key."
                details={(
                  <p>
                    The funding tx broadcasts to a real Kaspa node. The covenant id is the resulting P2SH address.
                    Covex never custodies your funds; for demo flows that use sandbox wallets, the surface clearly
                    says "Demo uses the dev wallets".
                  </p>
                )}
              />
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
