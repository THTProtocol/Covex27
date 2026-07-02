import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Terminal, TerminalSquare, Boxes, ShieldCheck, Radio, Lock,
  ArrowRight, ArrowLeft, Wand2, Cpu, Rocket, LayoutTemplate, Compass, FlaskConical,
} from '../lib/routeIcons.js';
import CovexTerminal, { ZK_CIRCUIT_TYPES, resolveCircuit } from '../components/CovexTerminal';
import SandboxCircuitPreview from '../components/SandboxCircuitPreview';
import { ZkStudioEmbedded } from './ZkStudio';
import SandboxGallery from '../components/SandboxGallery';
import CovenantAssistant from '../components/CovenantAssistant';
import SilverTerminal from '../components/SilverTerminal';
import HowThisWorks from '../components/HowThisWorks.jsx';
import EnforcedDeploy from './EnforcedDeploy';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { BUILD_STEPS } from '../lib/build-steps.js';

// Covenant Sandbox: a calm, premium ORCHESTRATOR. It only sequences and frames the existing
// engine, never re-implements its logic. The flow follows the user's exact mental model in three
// named phases: (1) Create the covenant, (2) Choose how it resolves (the oracle / ZK logic),
// (3) Build the page. One focused panel renders at a time with a persistent context bar so a newcomer never
// gets lost, while an expert can jump phases without losing the selection. The non-custodial deploy
// path inside CovexTerminal is untouched; tier gating via /api/paid-status stays intact; template
// deep-links (?circuit=&kind=&name=&desc=) keep working and can land directly in Phase 2.

// Honest enforcement realities. For the circom suite a raw Groth16 proof is verified off-chain, so
// every full-zk / hybrid circuit renders as oracle-attested (off-chain verify + on-chain Schnorr
// co-signature). All verified circom circuits are Groth16 verified OFF-CHAIN by anyone (you, the
// counterparty, or any external resolver); a valid proof gates a 2-of-2 cosign + CSV timeout, and
// the only on-chain check is the Schnorr co-signature. KIP-16's OpZkPrecompile is a separate
// on-chain ZK path the settlement covenant targets, gated until proven live on Kaspa.
// on-chain means Kaspa P2SH consensus only. accent drives the Card identity bar; badgeVariant
// drives the Badge. We never render a green "ZK on-chain" badge for a cosign-gated circuit.
const REALITY = {
  'on-chain': {
    label: 'On-chain enforced', accent: '#34d399', badgeVariant: 'on-chain', Icon: ShieldCheck,
    note: 'Consensus-enforced by the Kaspa P2SH commitment. The chain itself guarantees the rules.',
  },
  // Every verified circom circuit maps here: a real Groth16 proof verified fail-closed OFF-CHAIN by
  // anyone (you, the counterparty, or any external resolver). For the circom suite the proof is
  // verified off-chain; a valid proof gates a 2-of-2 cosign + CSV timeout, and the only on-chain
  // check is the Schnorr co-signature. full-zk and hybrid both render honestly as oracle-attested,
  // never as a green ZK on-chain badge. KIP-16's on-chain path is gated until proven live on Kaspa.
  'full-zk': {
    label: 'Resolver-attested', accent: '#fbbf24', badgeVariant: 'oracle', Icon: Radio,
    note: 'A real Groth16 proof is verified fail-closed OFF-CHAIN by you, the counterparty, or any external resolver (snarkjs against the served vkey). For the circom suite the proof is verified off-chain; a valid proof gates a 2-of-2 cosign + CSV timeout, and only the Schnorr co-signature is checked on-chain. KIP-16 adds a separate on-chain ZK path, gated until proven live on Kaspa.',
  },
  hybrid: {
    label: 'Resolver-attested', accent: '#fbbf24', badgeVariant: 'oracle', Icon: Radio,
    note: 'A ZK property proof verified off-chain by you, the counterparty, or any external verifier; a valid proof gates the 2-of-2 cosign that releases the outcome. The only on-chain check is the Schnorr co-signature.',
  },
  'oracle-attested': {
    label: 'Resolver-attested', accent: '#fbbf24', badgeVariant: 'oracle', Icon: Radio,
    note: 'Resolved by a signed attestation from a deployer-bound external resolver (bound by pubkey at deploy) of an off-chain outcome. Covex never attests outcomes; trust is in that resolver, with the payout settled on-chain.',
  },
  decorative: {
    label: 'Metadata', accent: '#9ca3af', badgeVariant: 'metadata', Icon: Lock,
    note: 'A descriptive label only. The chain does not enforce this property; it is metadata attached to the covenant.',
  },
};

// First-use jargon glossary. Plain-language definitions surfaced as native title
// tooltips on the first mention of each term, so a newcomer never hits an
// unexplained acronym. Kept short and honest. No em dashes.
const JARGON = {
  daa: "DAA = Kaspa's block-height clock, ~10 blocks/sec. Timelocks unlock at a target DAA score.",
  p2sh: 'P2SH = pay-to-script-hash. Funds lock to the hash of the redeem script; spending must reveal a script that matches and satisfies it.',
  oracle: 'Oracle = a deployer-bound external resolver (bound by pubkey at deploy) that attests an off-chain outcome and co-signs the spend. Covex never attests outcomes; trust is in that named resolver. For ZK circuits the proof itself is verified off-chain by anyone.',
  redeem: 'Redeem script = the covenant logic the chain checks at spend time. The P2SH address commits to its hash.',
};

// Wraps a term in a dotted-underline span with a first-use title tooltip. Hoisted to
// module scope so it never remounts. Renders inline; safe inside paragraphs.
function Term({ k, children }) {
  return (
    <span title={JARGON[k]} className="underline decoration-dotted decoration-gray-500 light:decoration-slate-400 underline-offset-2 cursor-help">
      {children}
    </span>
  );
}

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

// Catalog circuit id -> the EnforcedDeploy KINDS id that actually builds it. For the 11
// primitives the catalog id IS the kind id, so they map to themselves. The one mismatch is
// the parimutuel market: the catalog circuit is `prediction_market` but EnforcedDeploy's
// market builder kind is `market`. Returns null when no on-chain builder owns the circuit
// (the long tail of ZK / oracle circuits, which deploy through the script terminal).
const CIRCUIT_TO_ENFORCED_KIND = { prediction_market: 'market' };
function enforcedKindFor(id) {
  if (!id) return null;
  const mapped = CIRCUIT_TO_ENFORCED_KIND[id] || id;
  return ENFORCED_DEPLOY_KINDS.has(mapped) ? mapped : null;
}

// One canonical label set for the 5 build steps, sourced from BUILD_STEPS (Create /
// Logic / Deploy / Website / Share) so the Sandbox phases, the "Your build" rail, and
// the global BuildStepsRail never drift apart. Keyed by step number.
const STEP_LABEL = Object.fromEntries(BUILD_STEPS.map((s) => [s.n, s.label]));

// The three sandbox phases in the 5-step model. The website / page step lives in
// /covenant/:id/studio after deploy, so it is intentionally not in this array.
// One source of truth for ?phase= persistence and the bottom CTA. Labels come from
// the canonical STEP_LABEL map.
const PHASES = [
  { id: 'create', n: 1, label: STEP_LABEL[1], Icon: Wand2 },
  { id: 'logic', n: 2, label: STEP_LABEL[2], Icon: Cpu },
  { id: 'deploy', n: 3, label: STEP_LABEL[3], Icon: TerminalSquare },
];

// The full 5-step model shown in the "Your build" rail. Steps 1-3 map to the
// reachable PHASES; steps 4 (Website) and 5 (Share) happen AFTER deploy, on the
// per-covenant Studio / public page, so they render as inert (non-interactive)
// markers. Labels come from the canonical STEP_LABEL map.
const RAIL_STEPS = [
  { id: 'create', n: 1, label: STEP_LABEL[1], Icon: Wand2, phase: 'create' },
  { id: 'logic', n: 2, label: STEP_LABEL[2], Icon: Cpu, phase: 'logic' },
  { id: 'deploy', n: 3, label: STEP_LABEL[3], Icon: TerminalSquare, phase: 'deploy' },
  { id: 'website', n: 4, label: STEP_LABEL[4], Icon: Rocket, phase: null },
  { id: 'share', n: 5, label: STEP_LABEL[5], Icon: ArrowRight, phase: null },
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
// of each kind they can actually start from: an oracle-resolved covenant, two real-Groth16 ZK
// circuits whose proofs are verified fail-closed OFF-CHAIN by anyone, a two-party covenant,
// age-gating, and a verifiable payout split. All six are in ZK_CIRCUIT_TYPES and land in Phase 2 on click.
const TEMPLATE_IDS = [
  'escrow_2party', 'merkle_membership', 'age_verification',
  'pot_distribution', 'prediction_market', 'chess_blitz',
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
    <span className={`inline-flex items-center gap-2 min-w-0 max-w-full rounded-full px-2.5 py-1 bg-white/[0.02] light:bg-white border border-white/5 light:border-slate-200 light:shadow-sm ${className}`}>
      <Boxes size={13} className="text-gray-400 light:text-slate-500 shrink-0" />
      <span className="text-[12px] font-semibold text-white light:text-slate-900 truncate">{name}</span>
      <Badge variant={reality.badgeVariant} dot className="hidden sm:inline shrink-0 text-[10px] py-0">{reality.label}</Badge>
    </span>
  );
}

// Restates the single next step at the top of every phase, driving the literal
// "Create -> Add logic -> Add a website" sentence model. Hoisted to module scope.
function PhaseHeader({ eyebrow, title, action }) {
  // Dark mode: transparent, sits directly on the page (unchanged). Light mode: the
  // canonical premium light surface. The `light:rounded-2xl` class is what triggers
  // index.css's single-source-of-truth `.light [class*="rounded-2xl"]` rule (frosted
  // --lm-surface white + brand-hairline border + soft shadow-2 lift + backdrop blur),
  // so the header reads as a deliberate, cohesive light panel instead of a flat
  // white-on-white wash or a dark charcoal slab. Padding makes the surface breathe.
  // Every override is `light:`-prefixed, so the dark appearance is unchanged.
  return (
    <div className="light:rounded-2xl light:px-5 light:py-4 sm:light:px-6 sm:light:py-5">
      <div className="label-xs text-kaspa-green light:text-emerald-700 mb-1">{eyebrow}</div>
      <h2 className="text-2xl sm:text-[28px] font-extrabold tracking-[-0.015em] leading-tight text-white light:text-slate-900">{title}</h2>
      <p className="text-[15px] text-gray-300 light:text-slate-700 mt-1.5 max-w-2xl">{action}</p>
    </div>
  );
}

// Guided | Pro | Prove (ZK) segmented control. role=radiogroup + role=radio so the workspace
// toggle is keyboard + screen-reader honest. Hoisted to module scope. "Prove (ZK)" is how the
// in-browser zero-knowledge prove + verify capability is chosen FROM Build (it is not a separate
// top-level destination). The first two modes build a covenant; the third tests a ZK proof.
const MODE_TITLES = {
  guided: 'Guided: Covex walks you through create, logic, and deploy.',
  pro: 'Pro: a raw SilverScript terminal. No templates, no auto-fill, you write the covenant yourself.',
  prove: 'Prove (ZK): generate and verify a real Groth16 proof in your browser, before you deploy a covenant that uses it.',
};
function ModeSegmented({ mode, onChange }) {
  const opts = [
    { id: 'guided', label: 'Guided', Icon: Wand2 },
    { id: 'pro', label: 'Pro', Icon: TerminalSquare },
    { id: 'prove', label: 'Prove (ZK)', Icon: FlaskConical },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Workspace mode"
      className="inline-flex items-center p-1 rounded-xl border border-white/10 light:border-slate-200 bg-white/[0.03] light:bg-white light:shadow-sm"
    >
      {opts.map((o) => {
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            title={MODE_TITLES[o.id]}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-kaspa-green/60 ${
              active
                ? 'bg-kaspa-green text-black light:bg-emerald-700 light:text-white shadow-sm'
                : 'text-gray-400 light:text-slate-600 hover:text-white light:hover:text-slate-900'
            }`}
          >
            <o.Icon size={14} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// "Your build" rail: the 5-step model with the live selection chip and the
// Continue/Back action. role=tablist + aria-current="step" keep it accessible;
// steps 4-5 (Website, Share) happen after deploy and render as inert <span>s.
// Hoisted to module scope so it never remounts. The same component renders in the
// sticky desktop rail; on mobile the action lives in a separate bottom bar.
function BuildRail({
  phase, circuit, reality, name, reachable, onGoto, onForward, onBack, learn,
}) {
  return (
    <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white light:shadow-sm p-4">
      <div className="label-xs text-gray-400 light:text-slate-600 mb-3">Your build</div>
      <ol role="tablist" aria-label="Build steps" aria-orientation="vertical" className="space-y-1">
        {RAIL_STEPS.map((s) => {
          const isPhase = !!s.phase;
          const isActive = isPhase && s.phase === phase;
          const idx = PHASES.findIndex((p) => p.id === s.phase);
          const canReach = isPhase && reachable(idx);
          const done = isPhase && idx > -1 && idx < PHASES.findIndex((p) => p.id === phase);
          const common = 'flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-xl text-[13px] transition-colors';
          const inner = (
            <>
              <span
                aria-hidden="true"
                className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-bold shrink-0 border ${
                  isActive
                    ? 'bg-kaspa-green text-black border-kaspa-green light:bg-emerald-700 light:text-white light:border-emerald-700'
                    : done
                    ? 'bg-kaspa-green/15 text-kaspa-green border-kaspa-green/30 light:bg-emerald-50 light:text-emerald-700 light:border-emerald-200'
                    : 'bg-white/[0.03] text-gray-400 border-white/10 light:bg-slate-50 light:text-slate-500 light:border-slate-200'
                }`}
              >
                {s.n}
              </span>
              <s.Icon size={14} className={isActive ? 'text-kaspa-green light:text-emerald-700' : 'text-gray-500 light:text-slate-600'} />
              <span className={`font-semibold truncate ${isActive ? 'text-white light:text-slate-900' : isPhase ? 'text-gray-300 light:text-slate-700' : 'text-gray-500 light:text-slate-600'}`}>{s.label}</span>
              {!isPhase && <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-600 light:text-slate-600">after deploy</span>}
            </>
          );
          if (!isPhase) {
            // Inert post-deploy markers: a real <span>, not a button, so SR users
            // do not perceive them as actionable before a covenant exists.
            return (
              <li key={s.id}>
                <span className={`${common} cursor-default opacity-60`} aria-disabled="true">{inner}</span>
              </li>
            );
          }
          return (
            <li key={s.id}>
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'step' : undefined}
                disabled={!canReach}
                onClick={() => canReach && onGoto(s.phase)}
                className={`${common} focus:outline-none focus-visible:ring-2 focus-visible:ring-kaspa-green/60 ${
                  isActive
                    ? 'bg-kaspa-green/[0.08] light:bg-emerald-50'
                    : canReach
                    ? 'hover:bg-white/[0.04] light:hover:bg-slate-50'
                    : 'cursor-not-allowed opacity-50'
                }`}
              >
                {inner}
              </button>
            </li>
          );
        })}
      </ol>

      {/* Live selection + the Continue / Back action, on lg. */}
      <div className="mt-4 pt-4 border-t border-white/[0.06] light:border-slate-200 space-y-3">
        {circuit && reality ? (
          <SelectionChip name={name} reality={reality} className="w-full light:ring-1 light:ring-emerald-100" />
        ) : (
          <p className="text-[12px] text-gray-400 light:text-slate-500">Pick a covenant to continue.</p>
        )}
        {phase !== 'deploy' ? (
          <div className="flex items-center gap-2">
            {phase !== 'create' && (
              <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
                <ArrowLeft size={14} /> Back
              </Button>
            )}
            <Button
              variant="kaspa"
              shimmer
              size="sm"
              disabled={!circuit}
              onClick={onForward}
              className="flex-1 light:shadow-sm"
            >
              {phase === 'create' ? 'Continue to logic' : 'Continue to deploy'}
              <ArrowRight size={15} />
            </Button>
          </div>
        ) : (
          // Deploy: the builder owns the forward action, so the rail keeps only a
          // Back affordance to the logic phase. Without this, Back was unreachable
          // once you entered deploy.
          <Button variant="ghost" size="sm" onClick={onBack} className="w-full justify-center">
            <ArrowLeft size={14} /> Back to logic
          </Button>
        )}
      </div>

      {/* Quiet "Learn" disclosure: "What is a covenant?" lives here, not as a
          bordered box stacked above the tabs. */}
      <div className="mt-4 pt-4 border-t border-white/[0.06] light:border-slate-200">
        {learn}
      </div>
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
  // Workspace mode: 'guided' (Covex helps you build), 'pro' (raw SilverScript terminal, no
  // auto-fill), or 'prove' (the in-browser ZK prove + verify capability, chosen FROM Build).
  // Persisted in the URL so a pro can bookmark or deep-link straight into the terminal, and so the
  // /zk-studio redirect can land directly on ?mode=prove inside Build.
  const VALID_MODES = ['guided', 'pro', 'prove'];
  const [mode, setModeState] = useState(() => {
    const m = params.get('mode');
    return VALID_MODES.includes(m) ? m : 'guided';
  });
  const setMode = (m) => {
    setModeState(m);
    const next = new URLSearchParams(params);
    if (m && m !== 'guided') next.set('mode', m); else next.delete('mode');
    setParams(next, { replace: true });
  };
  // Phase-1 tab persistence. ?tab=templates|catalog lands a newcomer directly on either entry
  // point; default Assistant matches the first-load eyebrow promise. Tab state is independent of
  // ?phase= so a deep link can both pick a tab and a phase without one clobbering the other.
  // ?category=game (from the Arena "Create a game" CTA) lands the builder on the
  // catalog filtered to game circuits, so a player who wants their own table sees
  // only the games. The filter is purely a Phase-1 catalog view; selection wiring
  // is unchanged. Other categories are accepted generically for future entry points.
  const categoryFilter = (params.get('category') || '').toLowerCase() || null;
  const [createTab, setCreateTabState] = useState(() => {
    const t = params.get('tab');
    if (CREATE_TABS.some((x) => x.id === t)) return t;
    return (params.get('category') || '').toLowerCase() ? 'catalog' : 'assistant';
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
  // Catalog view, optionally narrowed to a single category (e.g. ?category=game).
  // If a category yields nothing (unknown value), fall back to the full catalog so
  // the builder is never an empty dead end.
  const catalogCircuits = useMemo(() => {
    if (!categoryFilter) return ZK_CIRCUIT_TYPES;
    const filtered = ZK_CIRCUIT_TYPES.filter((c) => (c.category || '').toLowerCase() === categoryFilter);
    return filtered.length ? filtered : ZK_CIRCUIT_TYPES;
  }, [categoryFilter]);
  const kind = kindForCircuit(circuit);
  const reality = circuit ? (REALITY[circuit.reality] || REALITY['oracle-attested']) : null;
  // The EnforcedDeploy kind id that owns this circuit's real on-chain signing, or null when
  // the circuit deploys through the script terminal instead. Drives the Phase 3 branch + banner.
  const deployKind = enforcedKindFor(selectedId);

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

  // URL -> state sync. The Sandbox is a single route element, so navigating to
  // /sandbox?phase=logic&circuit=... while already mounted (e.g. the guided tour
  // stepping through the phases) does NOT remount the component or re-run the
  // useState initializers above. Without this, the tour's ?phase / ?circuit are
  // ignored and the logic/deploy panels never mount. We mirror the params into
  // state when they differ; the component's own setters already write the URL to
  // match state, so once state catches up the params equal state and this no-ops
  // (no feedback loop). Reading the primitive param strings keeps the deps stable.
  const pPhase = params.get('phase');
  const pCircuit = params.get('circuit');
  const pKind = params.get('kind') || '';
  const pName = params.get('name') || '';
  const pMode = params.get('mode');
  const pTab = params.get('tab');
  const pCategory = (params.get('category') || '').toLowerCase();
  useEffect(() => {
    // phase
    const wantPhase = pPhase && PHASES.some((x) => x.id === pPhase) ? pPhase : 'create';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
    if (wantPhase !== phase) setPhaseState(wantPhase);
    // selection
    const wantId = pCircuit ? resolveCircuit(pCircuit, pKind) : null;
    const validId = wantId && ZK_CIRCUIT_TYPES.some((c) => c.id === wantId) ? wantId : null;
    if (validId !== selectedId) {
      setSelectedId(validId);
      setTplName(pName);
    } else if (pName && pName !== tplName) {
      setTplName(pName);
    }
    // mode
    const wantMode = VALID_MODES.includes(pMode) ? pMode : 'guided';
    if (wantMode !== mode) setModeState(wantMode);
    // create tab: an explicit ?tab= wins; otherwise a ?category= deep-link (the Arena
    // "Create a game" CTA) lands on the catalog so the filtered list is visible.
    const wantTab = CREATE_TABS.some((x) => x.id === pTab) ? pTab : (pCategory ? 'catalog' : 'assistant');
    if (wantTab !== createTab) setCreateTabState(wantTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pPhase, pCircuit, pKind, pName, pMode, pTab, pCategory]);

  // Launch the global FirstCovenantTour overlay. Same mechanism as the Explorer
  // hero launcher: set the active flag, clear any prior skip, and dispatch a
  // synthetic same-tab 'storage' event (the native one only fires cross-tab) so
  // the single mounted tour instance picks it up immediately. The tour then
  // drives the user from the Explorer hero through these very build phases.
  const startTour = () => {
    try {
      window.localStorage.removeItem('covex_tour_skipped');
      window.localStorage.setItem('covex_tour_active', '1');
      window.dispatchEvent(new StorageEvent('storage', { key: 'covex_tour_active', newValue: '1' }));
    } catch {
      /* ignore quota / private mode */
    }
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
    <div className="relative z-10 text-center text-sm text-gray-400 light:text-slate-700 py-16 light:bg-white light:border light:border-slate-200 light:rounded-2xl light:shadow-sm">
      Pick a covenant first.{' '}
      <button onClick={() => setPhase('create')} className="text-kaspa-green light:text-emerald-700 hover:underline font-semibold">
        Go to create
      </button>
    </div>
  );

  // The quiet "What is a covenant?" Learn disclosure lives in the right rail now,
  // not as a bordered box above the tabs. Reused across phases via the rail.
  const covenantDetails = (
    <p>
      Covex compiles your covenant DSL into a Kaspa <Term k="redeem">redeem script</Term>. Funds lock to its{' '}
      <Term k="p2sh">P2SH</Term> commitment. Some redeem paths are consensus-enforced by Kaspa alone;{' '}
      <Term k="oracle">oracle</Term> paths require a deployer-bound external resolver to co-sign, which is the
      off-chain reality for ZK and parimutuel circuits. For ZK circuits the proof itself is verified off-chain by anyone.
    </p>
  );
  const learnDisclosure = (
    <HowThisWorks
      title="What is a covenant?"
      summary="A program that locks Kaspa funds until rules are met."
      details={covenantDetails}
    />
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 relative">
      <div className="covex-aurora hidden sm:block light:opacity-40" style={{ top: 48, left: -30, width: 420, height: 260 }} aria-hidden="true" />

      {/* SLIM HERO: H1 + one-line value prop + "Free to explore" badge, with the
          Guided | Pro segmented control top-right. The old no-op "Start guided build"
          card, the pro-terminal link/paragraph, and the "Back to guided build" link are
          all replaced by this one control. */}
      <div className="relative z-10 mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <Terminal size={22} className="text-kaspa-green light:text-emerald-700 shrink-0" />
            <h1 className="h-page text-white light:text-slate-900">Build a covenant</h1>
            <Badge variant="glass" dot>Free to explore</Badge>
          </div>
          <p className="text-sm sm:text-base text-gray-300 light:text-slate-700 max-w-2xl">
            Build any Kaspa covenant - escrows, vesting, fundraisers, conditional payments, ZK-credential proofs, timelocks, multisig, or your own custom logic - then give it a full public website. Step by step, non-custodial. Exploring and simulating is free; deploying needs only your own wallet.
          </p>
          {/* Visible build-tour launcher. This is a BUILD tour, so the affordance
              belongs here, not only on the Explorer hero. */}
          <button
            type="button"
            onClick={startTour}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-kaspa-green light:text-emerald-700 hover:text-kaspa-green/80 light:hover:text-emerald-800 underline-offset-4 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-kaspa-green/60 rounded"
          >
            <Compass size={14} className="shrink-0" />
            New here? Take the 60-second tour
          </button>
        </div>
        <div className="shrink-0">
          <ModeSegmented mode={mode} onChange={setMode} />
        </div>
      </div>

      {mode === 'pro' && (
        <div className="relative z-10">
          <SilverTerminal />
        </div>
      )}

      {/* Prove (ZK): the in-browser zero-knowledge prove + verify capability, surfaced AS PART of
          Build (a workspace choice), not a separate top-level page. Same engine + circuits as the
          standalone /zk-studio. A newcomer can test a circuit's ZK logic here before deploying a
          covenant that uses it. */}
      {mode === 'prove' && (
        <div className="relative z-10">
          <ZkStudioEmbedded />
        </div>
      )}

      {mode === 'guided' && (
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* LEFT: the active phase panel. */}
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.div key={phase} {...panelMotion} className="min-w-0">

                {/* PHASE 1 - CREATE. Three intentional, equal entry points (Assistant /
                    Templates / Catalog). Tabs-first: the tab bar sits immediately under the
                    PhaseHeader as a simple bottom border, not a full Card wrapper. */}
                {phase === 'create' && (
                  <div className="space-y-5 min-w-0">
                    <PhaseHeader eyebrow={circuit && name ? `Building ${name}` : 'New covenant'} title="Create the covenant" action="Start from an idea, a template, or the full catalog." />
                    {/* Mobile-only "What is a covenant?" definition. On lg the same text lives
                        in the right rail (hidden lg:block), so it is duplicated here below lg
                        rather than left invisible to phone users. */}
                    <div className="lg:hidden rounded-xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white light:shadow-sm p-4">
                      <div className="text-sm font-bold text-white light:text-slate-900 mb-1">What is a covenant?</div>
                      <p className="text-[12px] text-gray-400 light:text-slate-600 mb-2">A program that locks Kaspa funds until rules are met.</p>
                      <div className="text-[12px] text-gray-300 light:text-slate-700 leading-relaxed">{covenantDetails}</div>
                    </div>
                    {/* Segmented tab control as a simple bottom border. role=tablist + role=tab
                        keep this keyboard + screen-reader honest. */}
                    <div data-tour="sandbox-create" role="tablist" aria-label="Create entry points" className="flex items-stretch gap-1 border-b border-white/10 light:border-slate-200">
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
                            className={`relative flex items-center justify-center gap-2 px-3.5 py-2.5 -mb-px text-[13px] sm:text-sm font-semibold border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-kaspa-green/60 ${
                              active
                                ? 'text-kaspa-green light:text-emerald-700 border-kaspa-green light:border-emerald-600'
                                : 'text-gray-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 border-transparent'
                            }`}
                          >
                            <Icon size={15} className="shrink-0" />
                            <span className="truncate">{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Shared content surface. One tab body mounts at a time so heavy children
                        (the full catalog) only render when requested. */}
                    <div
                      id={`create-tab-${createTab}`}
                      role="tabpanel"
                      aria-labelledby={`create-tab-btn-${createTab}`}
                      tabIndex={-1}
                      className="min-w-0 focus:outline-none"
                    >
                      {createTab === 'assistant' && (
                        <CovenantAssistant circuits={ZK_CIRCUIT_TYPES} onSelect={useAndConfigure} />
                      )}
                      {createTab === 'templates' && (
                        <SandboxGallery circuits={templateCircuits} selectedId={selectedId} onSelect={select} />
                      )}
                      {createTab === 'catalog' && (
                        <>
                          {categoryFilter === 'game' && catalogCircuits !== ZK_CIRCUIT_TYPES && (
                            <p className="mb-3 text-xs text-gray-300 light:text-slate-600">
                              Showing covenants in this category. Pick one, set the stake on the next step, then deploy and share the link.{' '}
                              <button type="button" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.delete('category'); return n; }, { replace: true })} className="text-kaspa-green light:text-emerald-700 hover:underline font-semibold">Show the full catalog</button>
                            </p>
                          )}
                          <SandboxGallery circuits={catalogCircuits} selectedId={selectedId} onSelect={select} />
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* PHASE 2 - ADD LOGIC */}
                {phase === 'logic' && (circuit && reality ? (
                  <div className="space-y-4 min-w-0">
                    <PhaseHeader eyebrow={circuit && name ? `Building ${name}` : 'New covenant'} title="Choose how it resolves" action="See exactly what the chain enforces and who decides the outcome, then tune it." />
                    <Card data-tour="sandbox-logic" accent={reality.accent} className="overflow-hidden light:shadow-sm light:border light:border-slate-200">
                      <div className="px-5 py-4 flex flex-wrap items-center gap-3 light:bg-slate-50/40 light:border-b light:border-slate-200">
                        <Boxes size={18} className="text-kaspa-green light:text-emerald-700" />
                        <span className="text-xs uppercase tracking-widest text-gray-400 light:text-slate-600 light:font-semibold">Selected</span>
                        <span className="text-white light:text-slate-900 font-semibold">{name}</span>
                        <Badge variant={reality.badgeVariant} dot className="ml-auto">{reality.label}</Badge>
                      </div>
                      <div className="px-5 pb-4 pt-4 grid md:grid-cols-3 gap-4 text-sm">
                        <div className="md:col-span-2 min-w-0">
                          <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-600 light:font-semibold mb-1">Circuit id</div>
                          <div className="text-white light:text-slate-900 font-mono text-xs mb-2 break-all light:bg-slate-100 light:px-2 light:py-1 light:rounded-md light:inline-block">{circuit.id}</div>
                          <p className="text-gray-300 light:text-slate-700 leading-relaxed">{circuit.description}</p>
                        </div>
                        <div className="rounded-xl bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200 light:shadow-sm p-3">
                          <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-600 light:font-semibold mb-1">What enforcement means</div>
                          <p className="text-gray-300 light:text-slate-700 text-xs leading-relaxed">{reality.note}</p>
                        </div>
                      </div>
                      {/* First-use jargon: hover any term for a plain-language definition. */}
                      <div className="px-5 pb-4 -mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 light:text-slate-500">
                        <span className="uppercase tracking-wider light:font-semibold">Key terms</span>
                        <Term k="daa">DAA</Term>
                        <Term k="p2sh">P2SH</Term>
                        <Term k="oracle">Oracle</Term>
                        <Term k="redeem">Redeem script</Term>
                      </div>
                    </Card>
                    <SandboxCircuitPreview key={circuit.id} circuit={circuit} kind={kind} />
                  </div>
                ) : emptyState)}

                {/* PHASE 3 - DEPLOY (the real builder). The page / website step lives in /covenant/:id/studio. */}
                {phase === 'deploy' && (circuit ? (
                  <div className="space-y-5 min-w-0">
                    <PhaseHeader eyebrow={circuit && name ? `Building ${name}` : 'New covenant'} title="Deploy" action="Sign the funding transaction in your wallet to create the covenant." />
                    {/* Universal signing honesty banner. The single most important truth in the
                        flow: the user's wallet signs, Covex never holds the key. Always visible. */}
                    <div data-tour="sandbox-deploy" className="rounded-xl border border-kaspa-green/30 light:border-emerald-300 bg-kaspa-green/[0.04] light:bg-emerald-50 light:shadow-sm px-4 py-3 flex items-start gap-2.5">
                      <ShieldCheck size={16} className="text-kaspa-green light:text-emerald-700 mt-0.5 shrink-0" />
                      <div className="text-xs">
                        <div className="font-bold text-white light:text-slate-900">Your wallet signs this. Covex never holds your key.</div>
                        <div className="text-gray-400 light:text-slate-700 mt-0.5">The funding tx broadcasts to a Kaspa node and the covenant id is the resulting <Term k="p2sh">P2SH</Term> address.</div>
                      </div>
                    </div>
                    {/* THE REAL BUILDER. EnforcedDeploy owns the on-chain primitives end to end
                        (signing, broadcast, covenant id). On a successful deploy it hands back the
                        new covenant id and we open Studio with ?fresh=1 so the page starts empty.
                        deployKind maps the catalog circuit id to the right EnforcedDeploy kind (so
                        prediction_market reaches the market builder, not the terminal). Everything
                        outside that set falls back to CovexTerminal with a clear explanation. */}
                    {deployKind ? (
                      <EnforcedDeploy
                        embedded
                        initialKind={deployKind}
                        onDeployed={(covenantId) => navigate('/covenant/' + covenantId + '/studio?fresh=1')}
                      />
                    ) : (
                      <>
                        {/* FE-1: HONEST GATE. This circuit is NOT one of the publicly deployable
                            on-chain primitives (game / ZK / long-tail circuits are not wired to a
                            wallet-signed deploy yet). The script terminal below can DESIGN the
                            covenant script + config, but it cannot deploy on-chain, so we say that
                            plainly instead of promising a deploy that never completes. */}
                        <div className="rounded-xl border border-amber-500/30 light:border-amber-300 bg-amber-500/[0.06] light:bg-amber-50 light:shadow-sm px-4 py-3 flex items-start gap-2.5">
                          <Cpu size={16} className="text-amber-300 light:text-amber-700 mt-0.5 shrink-0" />
                          <div className="text-xs">
                            <div className="font-bold text-white light:text-slate-900">This circuit is not publicly deployable yet.</div>
                            <div className="text-gray-400 light:text-slate-700 mt-0.5">Wallet-signed on-chain deploy is live today for the on-chain primitives only (single-key, hashlock, timelock, relative timelock). The terminal below lets you DESIGN and export this covenant's script and config, but it does not deploy on-chain. To deploy something live now, pick an on-chain primitive in the <button type="button" onClick={() => navigate('/deploy/enforced')} className="text-kaspa-green light:text-emerald-700 hover:underline font-semibold">enforced deploy builder</button>.</div>
                          </div>
                        </div>
                        <CovexTerminal externalCircuit={selectedId} />
                      </>
                    )}
                    {/* Demoted post-deploy note: "design a website" is step 4 in the rail, so this is
                        a single quiet line, not a premature promo card. Points back to the Phase 1
                        "See an example" preview so the one genuinely visual artifact (the public page)
                        is previewable before any funds move, not only after deploy. */}
                    <p className="flex items-start gap-2 text-xs text-gray-400 light:text-slate-600">
                      <Rocket size={14} className="text-kaspa-green light:text-emerald-700 mt-0.5 shrink-0" />
                      <span>
                        After your funding tx confirms, the visual Studio opens automatically so you can design the public page (also at /covenant/:id/studio).{' '}
                        <button
                          type="button"
                          onClick={() => setPhase('create')}
                          className="text-kaspa-green light:text-emerald-700 hover:underline font-semibold"
                        >
                          Preview the page layout
                        </button>{' '}
                        first from any template's "See an example".
                      </span>
                    </p>
                  </div>
                ) : emptyState)}

              </motion.div>
            </AnimatePresence>
          </div>

          {/* RIGHT: sticky "Your build" rail on lg. Holds the 5-step model, the live
              selection chip, the Continue/Back action, and the quiet Learn disclosure. */}
          <aside className="hidden lg:block lg:sticky lg:top-24 self-start">
            <BuildRail
              phase={phase}
              circuit={circuit}
              reality={reality}
              name={name}
              reachable={reachable}
              onGoto={setPhase}
              onForward={goForward}
              onBack={goBack}
              learn={learnDisclosure}
            />
          </aside>
        </div>
      )}

      {/* MOBILE-ONLY sticky bottom action bar (< lg). On lg the action lives in the
          rail. Sticky at every mobile breakpoint so the primary CTA never scrolls
          away; a top shadow lifts it above the scrolling content. On deploy the
          builder owns the forward CTA, so the bar keeps only a Back affordance. */}
      {mode === 'guided' && (
        <div
          className="lg:hidden sticky z-20 mt-6 rounded-2xl glass-panel border border-kaspa-green/30 light:border-emerald-300 light:bg-white shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.6)] light:shadow-md px-5 py-3.5"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between gap-3">
            {phase !== 'create' ? (
              <Button variant="ghost" size="sm" onClick={goBack} className="shrink-0">
                <ArrowLeft size={14} /> {phase === 'deploy' ? 'Back to logic' : 'Back'}
              </Button>
            ) : <span />}
            {phase !== 'deploy' && (
              <Button
                variant="kaspa"
                shimmer
                className="shrink-0 light:shadow-md"
                disabled={!circuit}
                onClick={goForward}
              >
                Continue
                <ArrowRight size={15} className="light:drop-shadow-sm" />
              </Button>
            )}
          </div>
          {/* Adjacent reason for the disabled CTA: the button alone gives no hint why
              it is greyed out. Shown only when Continue is visible but blocked. */}
          {phase !== 'deploy' && !circuit && (
            <p className="mt-2 text-[11px] text-gray-400 light:text-slate-500 text-right">
              Pick a covenant above to continue.
            </p>
          )}
        </div>
      )}

      {mode === 'guided' && (
        <div className="mt-8 text-center text-xs text-gray-500 light:text-slate-600">
          Or browse ready-made starting points in the <Link to="/templates" className="text-kaspa-green light:text-emerald-700 hover:underline">template library</Link>.
        </div>
      )}
    </div>
  );
}
