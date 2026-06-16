import { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Terminal, ArrowDown, Boxes, ShieldCheck, Radio, Cpu, Wrench, Sparkles } from 'lucide-react';
import CovexTerminal, { ZK_CIRCUIT_TYPES, resolveCircuit } from '../components/CovexTerminal';
import SandboxCircuitPreview from '../components/SandboxCircuitPreview';
import SandboxGallery from '../components/SandboxGallery';

// Unified Sandbox: ONE window where the free circuit library (left) drives a live preview
// (right) and the builder/terminal (below) all at once. Pick any circuit and the enforcement
// reality, the "how it resolves" flow, the payout simulator, and the builder's selection update
// together — no reload, no wallet to explore. Templates still deep-link here (?circuit=&kind=).

const REALITY = {
  'on-chain': { label: 'On-chain enforced', cls: 'text-kaspa-green border-kaspa-green/40 bg-kaspa-green/10', Icon: ShieldCheck,
    note: 'Consensus-enforced by the Kaspa P2SH commitment. The chain itself guarantees the rules.' },
  'full-zk': { label: 'On-chain enforced', cls: 'text-kaspa-green border-kaspa-green/40 bg-kaspa-green/10', Icon: ShieldCheck,
    note: 'A live Groth16 proof gates the spend. Trustless: the proof is the key.' },
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

  return (
    <div className="max-w-7xl mx-auto px-4 pt-24 pb-16 relative">
      <div className="covex-aurora hidden sm:block" style={{ top: 48, left: -30, width: 420, height: 260 }} aria-hidden="true" />
      {/* Header */}
      <div className="relative flex flex-wrap items-center gap-3 mb-2">
        <div className="flex items-center gap-2 text-kaspa-green">
          <Terminal size={22} />
          <h1 className="text-2xl font-bold text-white">Covenant Sandbox</h1>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green tracking-widest">FREE TO EXPLORE</span>
      </div>
      <p className="text-sm text-gray-300 max-w-3xl mb-6">
        Pick any covenant on the left and preview everything live: its real enforcement, how it resolves, and the
        payout math. The builder below follows your selection. Basic SilverScript is free; the advanced editor and
        deploy unlock with a tier. Nothing here overstates what the chain enforces.
      </p>

      {/* Choose a covenant: a category-organized gallery with progressive disclosure (View more) */}
      <div className="relative mb-8">
        <div className="text-[11px] uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
          <Boxes size={13} className="text-kaspa-green" /> Choose a covenant
        </div>
        <SandboxGallery circuits={ZK_CIRCUIT_TYPES} selectedId={selectedId} onSelect={select} />
      </div>

      {/* Live preview of the selected covenant: enforcement reality + how it resolves + payout */}
      <div className="space-y-4 mb-8 min-w-0">
        {circuit && (
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
        )}

        {/* Live preview: how it resolves + payout simulator (remounts on circuit change) */}
        {circuit && <SandboxCircuitPreview key={circuit.id} circuit={circuit} kind={kind} />}
      </div>

      {/* Configure & deploy: the real builder, synced to the selection above */}
      <div>
        <div className="text-[11px] uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
          <Wrench size={13} className="text-kaspa-green" /> Configure &amp; deploy
          <span className="text-[10px] text-gray-500 normal-case tracking-normal">preloaded with your selected circuit</span>
          <ArrowDown size={13} className="text-kaspa-green animate-bounce" />
        </div>
        <CovexTerminal externalCircuit={selectedId} />
      </div>

      <div className="mt-8 text-center text-xs text-gray-500">
        Or browse ready-made starting points in the <Link to="/templates" className="text-kaspa-green hover:underline">template library</Link>.
      </div>
    </div>
  );
}
