import { useMemo } from 'react';
import { Eye, FileSearch, Sparkles, ArrowRight } from 'lucide-react';
import ResolutionSimulator from '../lib/covenant-config/ResolutionSimulator';

// SandboxCircuitPreview: a FREE, no-wallet, read-only deep-dive for the circuit a visitor
// picked in the sandbox. It explains, honestly, how the covenant resolves (keyed to its real
// enforcement reality) and, for staked covenants, shows the interactive payout simulator
// (ResolutionSimulator, which is 100% faithful to the on-chain math and never overstates rake).
// Exploring and simulating costs nothing; only deploying a live covenant needs a tier.

// Plain-English resolution flow per enforcement reality. Nothing here overstates what the
// chain does: on-chain/full-zk are consensus/proof enforced; hybrid + oracle name the oracle.
const RESOLUTION_FLOW = {
  'on-chain': {
    label: 'Consensus-enforced',
    steps: [
      'The spender supplies the unlock condition (a key, a preimage, cosigners, or a reached timelock).',
      'The Kaspa P2SH script checks that condition at spend time.',
      'Funds release only if it is satisfied. No third party can move them.',
    ],
    note: 'The chain itself is the referee. This is the most trustless reality on Covex.',
  },
  'full-zk': {
    label: 'Zero-knowledge proof',
    steps: [
      'The claimant generates a Groth16 zero-knowledge proof for the statement.',
      'The verifier checks the proof against the committed public inputs.',
      'Funds release only on a valid proof. The proof itself is the key.',
    ],
    note: 'Trustless: knowing the secret witness lets you spend, and nothing else does.',
  },
  'hybrid': {
    label: 'ZK proof + oracle',
    steps: [
      'A zero-knowledge property proof covers part of the logic on-chain.',
      'The named oracle attests the off-chain part with a real signature.',
      'The payout releases when the proof and the attestation line up.',
    ],
    note: 'Part of the rule is proven on-chain, part is attested by the disclosed oracle.',
  },
  'oracle-attested': {
    label: 'Oracle-attested',
    steps: [
      'The off-chain outcome happens (a game result, a market event, a data feed).',
      'The Covex oracle signs that outcome with a real BIP340 signature.',
      'The signed attestation releases the on-chain payout to the winner.',
    ],
    note: 'Trust sits with the named oracle; the payout settlement itself is on-chain.',
  },
};

// Circuit categories where a competitive pot / expected-value simulation is meaningful.
const POT_CATEGORIES = new Set(['game', 'defi', 'oracle']);

export default function SandboxCircuitPreview({ circuit, kind }) {
  const showSimulator = useMemo(() => {
    if (!circuit) return false;
    return POT_CATEGORIES.has(circuit.category) || kind === 'game' || kind === 'oracle';
  }, [circuit, kind]);

  const simConfig = useMemo(() => {
    const mode = kind === 'oracle'
      ? 'oracle'
      : circuit?.reality === 'hybrid'
      ? 'hybrid'
      : (circuit?.reality === 'full-zk' ? 'zk' : 'oracle');
    return {
      resolution: {
        mode,
        circuit: { type: circuit?.id || 'custom' },
        payoutModel: { feeBasisPoints: 200 },
      },
    };
  }, [circuit, kind]);

  if (!circuit) return null;
  const flow = RESOLUTION_FLOW[circuit.reality] || RESOLUTION_FLOW['oracle-attested'];

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Eye size={16} className="text-kaspa-green" />
        <h2 className="text-sm font-bold text-white uppercase tracking-widest">Explore this covenant</h2>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green tracking-wider">FREE · NO WALLET</span>
      </div>

      {/* Resolution flow */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
        <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
          <FileSearch size={13} className="text-kaspa-green" /> How it resolves
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-gray-300">{flow.label}</span>
        </div>
        <ol className="space-y-2.5">
          {flow.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
              <span className="shrink-0 w-5 h-5 rounded-full bg-kaspa-green/10 border border-kaspa-green/30 text-kaspa-green text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-white/[0.06] leading-relaxed">{flow.note}</p>
      </div>

      {/* Payout simulator (interactive, faithful to on-chain math) */}
      {showSimulator && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
            <ArrowRight size={13} className="text-kaspa-green" /> Simulate the economics
          </div>
          <ResolutionSimulator
            config={simConfig}
            players={2}
            perSideStake={100}
            feePercent={2}
            potReturnPercent={2}
            minStake={1}
            maxStake={1000}
          />
        </div>
      )}

      {/* Honest free-vs-paid note */}
      <div className="rounded-xl border border-kaspa-green/20 bg-kaspa-green/5 p-4 flex items-start gap-3 text-sm">
        <Sparkles size={16} className="text-kaspa-green mt-0.5 shrink-0" />
        <div className="text-gray-300 leading-relaxed">
          <span className="text-white font-semibold">Free to explore and simulate.</span> Inspecting the circuit, its real
          enforcement, and the payout math costs nothing and needs no wallet. To deploy a live covenant on Kaspa, open the
          builder below; basic SilverScript is free and the advanced editor unlocks with a tier.
        </div>
      </div>
    </div>
  );
}
