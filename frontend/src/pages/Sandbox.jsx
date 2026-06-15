import { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Terminal, ArrowDown, Boxes, ShieldCheck, Radio, Cpu, BookOpen } from 'lucide-react';
import CovexTerminal, { ZK_CIRCUIT_TYPES, resolveCircuit } from '../components/CovexTerminal';

// Public Sandbox: the full Covex builder/terminal, reachable without a wallet so anyone
// can explore every covenant primitive, ZK circuit and oracle market. Templates from the
// catalog deep-link here (?circuit=&kind=&name=) and the terminal preloads the matching
// circuit. The advanced editor + deploy stay gated exactly as before (the terminal handles
// that); this page only adds a public home + an honest "starting point" banner so a visitor
// always sees what they picked and its real enforcement, with no wallet required to look.

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

export default function Sandbox() {
  const [params] = useSearchParams();
  const rawCircuit = params.get('circuit');
  const kind = params.get('kind') || '';
  const tplName = params.get('name') || '';

  const circuit = useMemo(() => {
    if (!rawCircuit) return null;
    const cid = resolveCircuit(rawCircuit, kind);
    return ZK_CIRCUIT_TYPES.find((c) => c.id === cid) || null;
  }, [rawCircuit, kind]);

  const reality = circuit ? (REALITY[circuit.reality] || REALITY['oracle-attested']) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 pt-24 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="flex items-center gap-2 text-kaspa-green">
          <Terminal size={22} />
          <h1 className="text-2xl font-bold text-white">Covenant Sandbox</h1>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green tracking-widest">FREE TO EXPLORE</span>
      </div>
      <p className="text-sm text-gray-300 max-w-3xl mb-6">
        Build, preview and simulate any covenant — every primitive, ZK proof, oracle market and game.
        Basic SilverScript is free; the advanced visual editor and deploy unlock with a tier. Nothing here
        overstates what the chain enforces: each starting point carries its real enforcement reality.
      </p>

      {/* Selected starting point banner (always visible, no wallet needed) */}
      {circuit ? (
        <div className="mb-8 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center gap-3">
            <Boxes size={18} className="text-kaspa-green" />
            <span className="text-xs uppercase tracking-widest text-gray-400">Starting point</span>
            <span className="text-white font-semibold">{tplName || circuit.name}</span>
            {reality && (
              <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${reality.cls}`}>
                <reality.Icon size={12} /> {reality.label}
              </span>
            )}
          </div>
          <div className="px-5 py-4 grid md:grid-cols-3 gap-4 text-sm">
            <div className="md:col-span-2">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Circuit</div>
              <div className="text-white font-mono text-xs mb-2">{circuit.id}</div>
              <p className="text-gray-300 leading-relaxed">{circuit.description}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">What enforcement means</div>
              <p className="text-gray-300 text-xs leading-relaxed">{reality?.note}</p>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-white/10 flex items-center gap-3 text-xs text-gray-400">
            <ArrowDown size={14} className="text-kaspa-green animate-bounce" />
            The builder below is preloaded with this circuit. Configure economics, oracles and looks, then deploy.
          </div>
        </div>
      ) : (
        <div className="mb-8 rounded-2xl border border-white/10 bg-black/40 p-5 flex flex-wrap items-center gap-3 text-sm text-gray-300">
          <BookOpen size={16} className="text-kaspa-green" />
          Start from scratch below, or pick a preconfigured starting point from the
          <Link to="/templates" className="text-kaspa-green hover:underline">template library</Link>.
        </div>
      )}

      {/* The real builder/terminal */}
      <CovexTerminal />
    </div>
  );
}
