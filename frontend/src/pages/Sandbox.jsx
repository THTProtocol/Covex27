import { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Terminal, Boxes, ShieldCheck, Radio, Cpu, Sparkles, Check, ChevronRight, ArrowRight, ArrowLeft, Wand2, Rocket } from 'lucide-react';
import CovexTerminal, { ZK_CIRCUIT_TYPES, resolveCircuit } from '../components/CovexTerminal';
import SandboxCircuitPreview from '../components/SandboxCircuitPreview';
import SandboxGallery from '../components/SandboxGallery';
import CovenantAssistant from '../components/CovenantAssistant';

// Unified Sandbox: ONE window where the free circuit library (left) drives a live preview
// (right) and the builder/terminal (below) all at once. Pick any circuit and the enforcement
// reality, the "how it resolves" flow, the payout simulator, and the builder's selection update
// together  -  no reload, no wallet to explore. Templates still deep-link here (?circuit=&kind=).

const REALITY = {
  'on-chain': { label: 'On-chain enforced', cls: 'text-kaspa-green border-kaspa-green/40 bg-kaspa-green/10', Icon: ShieldCheck,
    note: 'Consensus-enforced by the Kaspa P2SH commitment. The chain itself guarantees the rules.' },
  'full-zk': { label: 'Zero-knowledge', cls: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10', Icon: ShieldCheck,
    note: 'A real Groth16 proof is required and verified fail-closed by the disclosed Covex oracle, which gates the consensus-required co-signature. The proof cannot be faked; the oracle is the trusted verifier (Kaspa has no on-chain pairing verifier yet).' },
  'hybrid': { label: 'Hybrid', cls: 'text-amber-300 border-amber-500/40 bg-amber-500/10', Icon: Cpu,
    note: 'A ZK property proof plus an oracle attestation. Part of the logic is on-chain, part attested.' },
  'oracle-attested': { label: 'Oracle-attested', cls: 'text-sky-300 border-sky-500/40 bg-sky-500/10', Icon: Radio,
    note: 'Resolved by a signed oracle attestation of an off-chain outcome. Trust is in the named oracle, on-chain payout.' },
};

// A friendly kind for the preview/simulator gating, derived from the circuit's category.
function kindForCircuit(c) {
  if (!c) return '';
  if (c.category === 'game') return 'game';
  if (c.category === 'oracle' || c.category === 'defi') return 'oracle';
  return 'zk';
}

const DEFAULT_CIRCUIT = 'prediction_market';

export default function Sandbox() {
  const [params, setParams] = useSearchParams();

  // Initial selection: from a template deep-link (?circuit=), else a representative default.
  const [selectedId, setSelectedId] = useState(() => {
    const raw = params.get('circuit');
    const resolved = raw ? resolveCircuit(raw, params.get('kind') || '') : null;
    return (resolved && ZK_CIRCUIT_TYPES.some((c) => c.id === resolved)) ? resolved : DEFAULT_CIRCUIT;
  });
  // Template name only applies to the very first (deep-linked) selection.
  const [tplName, setTplName] = useState(() => params.get('name') || '');
  // Stepped wizard: one focused section at a time so the page isn't an endless scroll.
  const [step, setStep] = useState('choose'); // choose | configure | deploy

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
    setParams(next, { replace: true });
  };
  // The assistant's "Use this" is an explicit intent -> jump straight to the preview step, carrying
  // the suggested covenant name + the model's reasoning so the builder opens pre-named and described.
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
    setStep('configure');
  };

  const STEPS = [
    { id: 'choose', n: 1, label: 'Choose', Icon: Wand2 },
    { id: 'configure', n: 2, label: 'Preview', Icon: Cpu },
    { id: 'deploy', n: 3, label: 'Build & deploy', Icon: Rocket },
  ];
  const stepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 relative">
      <div className="covex-aurora hidden sm:block" style={{ top: 48, left: -30, width: 420, height: 260 }} aria-hidden="true" />
      {/* Header */}
      <div className="relative flex flex-wrap items-center gap-3 mb-2">
        <div className="flex items-center gap-2 text-kaspa-green">
          <Terminal size={22} />
          <h1 className="text-2xl font-bold text-white">Covenant Sandbox</h1>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green tracking-widest">FREE TO EXPLORE</span>
      </div>
      <p className="text-sm text-gray-300 max-w-3xl mb-5">
        Describe what you want or pick a covenant, preview exactly what the chain enforces, then build and deploy it
        non-custodially. Free to explore; the advanced editor and deploy unlock with a tier. Nothing here overstates what the chain enforces.
      </p>

      {/* Sticky step nav: one focused section at a time, so the page is never an endless scroll. */}
      <div className="sticky top-16 z-30 -mx-4 px-4 py-2.5 mb-7 bg-[#06070b]/85 light:bg-white/85 backdrop-blur-xl border-y border-white/[0.06] light:border-slate-200">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STEPS.map((s, i) => {
            const active = step === s.id;
            const done = stepIdx > i;
            const reachable = i === 0 || !!circuit; // can't preview/deploy without a selection
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                <button
                  onClick={() => reachable && setStep(s.id)}
                  disabled={!reachable}
                  className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border text-xs font-bold transition-all ${
                    active ? 'border-kaspa-green/60 bg-kaspa-green/15 text-white light:text-slate-900'
                      : done ? 'border-kaspa-green/30 bg-kaspa-green/[0.06] text-kaspa-green'
                      : reachable ? 'border-white/10 text-gray-300 hover:border-white/25 light:border-slate-200 light:text-slate-600'
                      : 'border-white/5 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${active ? 'bg-kaspa-green text-black' : done ? 'bg-kaspa-green/20 text-kaspa-green' : 'bg-white/10 text-gray-400'}`}>
                    {done ? <Check size={11} /> : s.n}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <ChevronRight size={14} className="text-gray-600 shrink-0" />}
              </div>
            );
          })}
          {circuit && (
            <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 text-[11px] text-gray-400 max-w-[40%] truncate">
              <Boxes size={12} className="text-kaspa-green shrink-0" /> {tplName || circuit.name}
            </span>
          )}
        </div>
      </div>

      {/* STEP 1 - choose: the assistant + the catalog gallery */}
      {step === 'choose' && (
        <div className="relative space-y-7">
          <CovenantAssistant circuits={ZK_CIRCUIT_TYPES} onSelect={useAndConfigure} />
          <div>
            <div className="text-[11px] uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <Boxes size={13} className="text-kaspa-green" /> Or browse the catalog
            </div>
            <SandboxGallery circuits={ZK_CIRCUIT_TYPES} selectedId={selectedId} onSelect={select} />
          </div>
          {circuit && (
            <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl border border-kaspa-green/30 bg-[#0a0d12]/90 light:bg-white/90 backdrop-blur-xl px-4 py-3 shadow-[0_12px_40px_-16px_rgba(73,234,203,0.45)]">
              <span className="text-sm text-gray-200 min-w-0 truncate"><span className="text-gray-400">Selected:</span> <span className="font-semibold text-white light:text-slate-900">{circuit.name}</span></span>
              <button onClick={() => setStep('configure')} className="btn-shimmer shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-kaspa-green text-black font-bold text-sm">
                Preview it <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2 - preview: enforcement reality + how it resolves + payout */}
      {step === 'configure' && (
        <div className="space-y-4 min-w-0">
          {circuit ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center gap-3">
                  <Boxes size={18} className="text-kaspa-green" />
                  <span className="text-xs uppercase tracking-widest text-gray-400">Selected</span>
                  <span className="text-white font-semibold">{tplName || circuit.name}</span>
                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    {circuit.reality === 'full-zk' && (
                      <span className="zk-live-glow inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-kaspa-green/15 text-kaspa-green border border-kaspa-green/40 tracking-wide">
                        <Sparkles size={11} /> LIVE GROTH16
                      </span>
                    )}
                    {reality && (
                      <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${reality.cls}`}>
                        <reality.Icon size={12} /> {reality.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-5 py-4 grid md:grid-cols-3 gap-4 text-sm">
                  <div className="md:col-span-2 min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Circuit</div>
                    <div className="text-white font-mono text-xs mb-2 break-all">{circuit.id}</div>
                    <p className="text-gray-300 leading-relaxed">{circuit.description}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">What enforcement means</div>
                    <p className="text-gray-300 text-xs leading-relaxed">{reality?.note}</p>
                  </div>
                </div>
              </div>

              <SandboxCircuitPreview key={circuit.id} circuit={circuit} kind={kind} />

              <div className="flex items-center justify-between gap-3 pt-2">
                <button onClick={() => setStep('choose')} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/10 text-gray-300 hover:text-white hover:border-white/25 text-sm font-semibold transition-colors">
                  <ArrowLeft size={14} /> Choose another
                </button>
                <button onClick={() => setStep('deploy')} className="btn-shimmer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-kaspa-green text-black font-bold text-sm">
                  Build &amp; deploy <ArrowRight size={15} />
                </button>
              </div>
            </>
          ) : (
            <div className="text-center text-sm text-gray-400 py-16">
              Pick a covenant first. <button onClick={() => setStep('choose')} className="text-kaspa-green underline">Go to choose</button>
            </div>
          )}
        </div>
      )}

      {/* STEP 3 - build & deploy: the real builder, synced to the selection */}
      {step === 'deploy' && (
        <div>
          <button onClick={() => setStep('configure')} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-kaspa-green transition-colors">
            <ArrowLeft size={14} /> Back to preview
          </button>
          <CovexTerminal externalCircuit={selectedId} />
        </div>
      )}

      <div className="mt-8 text-center text-xs text-gray-500">
        Or browse ready-made starting points in the <Link to="/templates" className="text-kaspa-green hover:underline">template library</Link>.
      </div>
    </div>
  );
}
