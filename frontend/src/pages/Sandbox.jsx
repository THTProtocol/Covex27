import { useMemo, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Terminal, Boxes, ShieldCheck, Radio, Lock, Check, ChevronDown,
  ArrowRight, ArrowLeft, Palette, Wand2, Cpu, Rocket,
} from 'lucide-react';
import CovexTerminal, { ZK_CIRCUIT_TYPES, resolveCircuit } from '../components/CovexTerminal';
import SandboxCircuitPreview from '../components/SandboxCircuitPreview';
import SandboxGallery from '../components/SandboxGallery';
import CovenantAssistant from '../components/CovenantAssistant';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

// Covenant Sandbox: a calm, premium ORCHESTRATOR. It only sequences and frames the existing
// engine, never re-implements its logic. The flow follows the user's exact mental model in three
// named phases: (1) Create the covenant, (2) Add the oracle / ZK logic, (3) Add the interactive UI
// website. One focused panel renders at a time with a persistent context bar so a newcomer never
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

const DEFAULT_CIRCUIT = 'prediction_market';

// The three renamed phases. One source of truth for the stepper rail and the bottom CTA.
const PHASES = [
  { id: 'create', n: 1, label: 'Create', Icon: Wand2 },
  { id: 'logic', n: 2, label: 'Add logic', Icon: Cpu },
  { id: 'ui', n: 3, label: 'Interactive UI', Icon: Rocket },
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
      <Boxes size={13} className="text-kaspa-green shrink-0" />
      <span className="text-[12px] font-semibold text-white light:text-slate-900 truncate">{name}</span>
      <Badge variant={reality.badgeVariant} dot className="shrink-0 text-[10px] py-0">{reality.label}</Badge>
    </span>
  );
}

// Restates the single next step at the top of every phase, driving the literal
// "Create -> Add logic -> Add a website" sentence model. Hoisted to module scope.
function PhaseHeader({ eyebrow, title, action }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-kaspa-green font-bold mb-1">{eyebrow}</div>
      <h2 className="text-xl font-bold text-white light:text-slate-900">{title}</h2>
      <p className="text-sm text-gray-400 light:text-slate-500 mt-1">{action}</p>
    </div>
  );
}

export default function Sandbox() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();

  // Initial selection: from a template deep-link (?circuit=), else a representative default.
  const [selectedId, setSelectedId] = useState(() => {
    const raw = params.get('circuit');
    const resolved = raw ? resolveCircuit(raw, params.get('kind') || '') : null;
    return (resolved && ZK_CIRCUIT_TYPES.some((c) => c.id === resolved)) ? resolved : DEFAULT_CIRCUIT;
  });
  // Template / assistant name only applies to the very first (deep-linked) selection.
  const [tplName, setTplName] = useState(() => params.get('name') || '');
  // Deep-links carrying a name or desc (a template or an assistant pick) land directly in Phase 2.
  const [phase, setPhase] = useState(() => {
    const raw = params.get('circuit');
    const hasContext = !!(params.get('name') || params.get('desc'));
    return raw && hasContext ? 'logic' : 'create';
  });

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
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Terminal size={22} className="text-kaspa-green" />
          <h1 className="text-2xl font-bold text-white light:text-slate-900">Covenant Sandbox</h1>
          <Badge variant="gold" dot>FREE TO EXPLORE</Badge>
        </div>
        <p className="text-sm text-gray-300 light:text-slate-600 max-w-3xl mb-5">
          Build a real Kaspa covenant in three steps: create it, add the oracle or ZK logic, then design its
          interactive website. Exploring and simulating is free and needs no wallet; deploy and the advanced editor
          unlock with a tier. Nothing here overstates what the chain enforces.
        </p>
      </div>

      {/* STICKY STEPPER RAIL: one source of truth = the three phases. */}
      <div className="sticky top-16 z-30 -mx-4 px-4 py-2.5 mb-7 bg-[#06070b]/85 light:bg-white/85 backdrop-blur-xl border-y border-white/[0.06] light:border-slate-200">
        <div className="flex items-center gap-1.5 flex-wrap">
          {PHASES.map((p, i) => {
            const active = phase === p.id;
            const done = phaseIdx > i;
            const ok = reachable(i);
            return (
              <button
                key={p.id}
                onClick={() => ok && setPhase(p.id)}
                disabled={!ok}
                className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border text-xs font-bold transition-all ${
                  active ? 'border-kaspa-green/60 bg-kaspa-green/15 text-white light:text-slate-900'
                    : done ? 'border-kaspa-green/30 bg-kaspa-green/[0.06] text-kaspa-green'
                    : ok ? 'border-white/10 text-gray-300 hover:border-white/25 light:border-slate-200 light:text-slate-600'
                    : 'border-white/5 text-gray-600 cursor-not-allowed light:border-slate-200 light:text-slate-400'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${active ? 'bg-kaspa-green text-black' : done ? 'bg-kaspa-green/20 text-kaspa-green' : 'bg-white/10 text-gray-400'}`}>
                  {done ? <Check size={11} /> : p.n}
                </span>
                {p.label}
              </button>
            );
          })}
          {circuit && reality && (
            <SelectionChip name={name} reality={reality} className="ml-auto" />
          )}
        </div>
      </div>

      {/* ONE PHASE PANEL AT A TIME */}
      <AnimatePresence mode="wait">
        <motion.div key={phase} {...panelMotion} className="relative z-10 min-w-0 pb-24 sm:pb-20">

          {/* PHASE 1 - CREATE */}
          {phase === 'create' && (
            <div className="space-y-7">
              <PhaseHeader eyebrow="Step 1" title="Create the covenant" action="Start from an idea, a template, or code." />
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
          )}

          {/* PHASE 2 - ADD LOGIC */}
          {phase === 'logic' && (circuit && reality ? (
            <div className="space-y-4 min-w-0">
              <PhaseHeader eyebrow="Step 2" title="Add the oracle / ZK logic" action="See exactly what the chain enforces, then tune it." />
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

          {/* PHASE 3 - INTERACTIVE UI + the real builder */}
          {phase === 'ui' && (circuit ? (
            <div className="space-y-5 min-w-0">
              <PhaseHeader eyebrow="Step 3" title="Add the interactive UI website" action="Build it, deploy non-custodially, then design its public page." />
              {/* Honest Studio explainer. No fake reward, no fake deployed id, no decoder pre-deploy. */}
              <Card hover accent="#E8AF34" className="p-5">
                <div className="flex items-start gap-4">
                  <span className="p-2.5 rounded-xl bg-[#E8AF34]/15 border border-[#E8AF34]/30 shrink-0">
                    <Palette size={20} className="text-[#E8AF34]" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white light:text-slate-900">Design your covenant's public website</h3>
                    <p className="text-xs text-gray-400 light:text-slate-500 mt-1 leading-relaxed">
                      The visual Studio (drag and drop, safe platform components only) binds to a deployed covenant id.
                      Deploy non-custodially in the builder below, then open Covenant Studio from the builder's Custom UI
                      Integration section or from your covenant page at /covenant/:id. Markets and game covenants get
                      their full custom-UI page this way.
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
              {/* THE REAL BUILDER, untouched. It owns deploy/broadcast + tier gating + its own Studio handoff. */}
              <CovexTerminal externalCircuit={selectedId} />
            </div>
          ) : emptyState)}

        </motion.div>
      </AnimatePresence>

      {/* PERSISTENT BOTTOM ACTION BAR. Hidden on phase 'ui' where CovexTerminal owns the deploy CTA. */}
      {phase !== 'ui' && (
        <div className="static sm:sticky sm:bottom-4 z-20 mt-6 flex items-center justify-between gap-3 rounded-2xl glass-panel border border-kaspa-green/30 px-4 py-3">
          <div className="min-w-0 flex items-center gap-2">
            {phase !== 'create' && (
              <Button variant="ghost" size="sm" onClick={goBack} className="shrink-0">
                <ArrowLeft size={14} /> Back
              </Button>
            )}
            {circuit && (
              <span className="text-sm text-gray-300 light:text-slate-600 truncate">
                <span className="text-gray-500">Selected:</span>{' '}
                <span className="font-semibold text-white light:text-slate-900">{name}</span>
              </span>
            )}
          </div>
          <Button
            variant="kaspa"
            shimmer
            className="shrink-0"
            disabled={!circuit && phase !== 'create'}
            onClick={goForward}
          >
            {phase === 'create' ? 'Continue: add logic' : 'Continue: interactive UI'} <ArrowRight size={15} />
          </Button>
        </div>
      )}

      <div className="mt-8 text-center text-xs text-gray-500 light:text-slate-400">
        Or browse ready-made starting points in the <Link to="/templates" className="text-kaspa-green hover:underline">template library</Link>.
      </div>
    </div>
  );
}
