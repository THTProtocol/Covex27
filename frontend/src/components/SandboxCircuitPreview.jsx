import { useMemo, useState, useEffect } from 'react';
import { Eye, FileSearch, Sparkles, ArrowRight, Code2, Copy, Check, Info, FlaskConical, ChevronDown } from '../lib/routeIcons.js';
import { Link } from 'react-router-dom';
import ResolutionSimulator from '../lib/covenant-config/ResolutionSimulator';
import TransparencyModal from './TransparencyModal';
import { FlagshipProver } from '../pages/ZkStudio';
import { STUDIO_CIRCUITS } from '../lib/zk/studioProvers';
import { IN_BROWSER_PROVERS } from '../lib/zk/circuits';

// generateSilverScriptForConfig lives in the 445kB CovexTerminal module. This component is
// the Sandbox Phase 2 (logic) explore-only preview, which should not pull the creator-terminal
// chunk on initial render. We dynamic-import the helper so the chunk only loads while the
// visitor is actually inspecting a circuit; the script panel renders a frame later.

// SandboxCircuitPreview: a FREE, no-wallet, read-only deep-dive for the circuit a visitor
// picked in the sandbox. It explains, honestly, how the covenant resolves (keyed to its real
// enforcement reality) and, for staked covenants, shows the interactive payout simulator
// (ResolutionSimulator, which is 100% faithful to the on-chain math and never overstates rake).
// Exploring and simulating costs nothing; only deploying a live covenant needs a tier.

// Plain-English resolution flow per enforcement reality. Nothing here overstates what the
// chain does: on-chain is consensus-enforced; full-zk/hybrid proofs are verified off-chain by
// anyone and gate a 2-of-2 cosign; oracle-attested names a deployer-bound external resolver.
const RESOLUTION_FLOW = {
  'on-chain': {
    label: 'Consensus-enforced',
    steps: [
      'The spender supplies the unlock condition (a key, a preimage, cosigners, or a reached timelock).',
      'The Kaspa P2SH script checks that condition at spend time.',
      'Funds release only if it is satisfied. No third party can move them.',
    ],
    note: 'The chain itself is the referee. This is the most consensus-enforced reality on Covex.',
  },
  'full-zk': {
    label: 'ZK proof verified off-chain',
    steps: [
      'The claimant generates a real Groth16 zero-knowledge proof for the statement.',
      'The proof is verified OFF-CHAIN (by you, the counterparty, or any external verifier - snarkjs against the audited vkey), fail-closed.',
      'Only a valid proof gates the 2-of-2 cosign; an invalid or missing proof is rejected, and only the Schnorr co-signature is checked on-chain.',
    ],
    note: 'The proof is real cryptography that anyone can re-verify off-chain. For the circom suite the proof is verified off-chain, so a valid proof gates a 2-of-2 cosign + CSV timeout rather than being checked by the chain. The trusted setup is a single-contributor dev ceremony, not a production MPC.',
  },
  'hybrid': {
    label: 'ZK proof verified off-chain',
    steps: [
      'A zero-knowledge property proof is generated for part of the logic.',
      'The proof is verified off-chain (by you, the counterparty, or any external verifier, fail-closed), and a deployer-bound resolver attests the rest with a real signature.',
      'The payout releases when the proof verifies and the cosign is collected; only the co-signature is checked on-chain.',
    ],
    note: 'For the circom suite no part of the proof is verified on-chain; it is verifiable off-chain by anyone, and a valid proof gates a 2-of-2 cosign whose Schnorr co-signature is what the chain checks.',
  },
  'oracle-attested': {
    label: 'Resolver-attested',
    steps: [
      'The off-chain outcome happens (a game result, a market event, a data feed).',
      'An external resolver the deployer binds by pubkey at deploy signs that outcome with a real BIP340 signature.',
      'The signed attestation releases the on-chain payout to the winner. Covex never attests real-world facts.',
    ],
    note: 'Trust sits with the deployer-bound resolver; the payout settlement itself is on-chain.',
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

  // The declared, human-readable covenant logic (SilverScript) for this circuit. Updates
  // live as you pick a circuit. This is the DECLARED logic - the real enforcement is the
  // "how it resolves" flow above (SilverScript opcode enforcement is still maturing; custody
  // is what the chain enforces today). Generated via a dynamic import so the terminal chunk
  // is not pulled until Phase 2 is actually being explored.
  const [exampleScript, setExampleScript] = useState(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
    if (!circuit) { setExampleScript(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('./CovexTerminal');
        if (cancelled) return;
        const text = mod.generateSilverScriptForConfig({
          gameType: circuit.id,
          zkCircuit: circuit.id,
          feePercent: 2,
          potReturnPercent: 2,
          resolutionMode: circuit.reality === 'full-zk' ? 'zk' : (circuit.reality === 'hybrid' ? 'hybrid' : 'oracle'),
          reusable: true,
          allowTopups: false,
          hasPaidAccess: true,
        });
        if (!cancelled) setExampleScript(text);
      } catch {
        if (!cancelled) setExampleScript(null);
      }
    })();
    return () => { cancelled = true; };
  }, [circuit]);

  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // Inline ZK test-prove: when the selected circuit has a working in-browser Groth16 prover with an
  // editable Studio schema, the user can generate + verify a real proof RIGHT HERE while configuring
  // the covenant, using the same engine as the Build "Prove (ZK)" view. Collapsed by default so the
  // heavy snarkjs chunk only loads when the user opens it.
  const canTestProve = !!circuit && IN_BROWSER_PROVERS.has(circuit.id) && !!STUDIO_CIRCUITS[circuit.id];
  const [showProver, setShowProver] = useState(false);
  // Reset the inline prover open-state whenever the selected circuit changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
  useEffect(() => { setShowProver(false); }, [circuit?.id]);
  const copyScript = async () => {
    if (!exampleScript) return;
    try {
      await navigator.clipboard.writeText(exampleScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  if (!circuit) return null;
  const flow = RESOLUTION_FLOW[circuit.reality] || RESOLUTION_FLOW['oracle-attested'];
  const realityLabel = { 'full-zk': 'Resolver-attested', 'on-chain': 'On-chain', hybrid: 'Resolver-attested', 'oracle-attested': 'Resolver-attested', decorative: 'Metadata' }[circuit.reality] || circuit.reality;

  return (
    <div className="mb-8 space-y-4">
      {showInfo && <TransparencyModal circuit={circuit} onClose={() => setShowInfo(false)} />}
      <div className="flex items-center gap-2 flex-wrap">
        <Eye size={16} className="text-kaspa-green" />
        <h2 className="text-sm font-bold text-white light:text-slate-900 uppercase tracking-widest">Explore this covenant</h2>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green tracking-wider">FREE · NO WALLET</span>
      </div>

      {/* Resolution flow */}
      <div className="rounded-2xl border border-white/10 bg-black/30 light:border-slate-200 light:bg-white p-5 hover-lift">
        <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-600 mb-4 flex items-center gap-2">
          <FileSearch size={13} className="text-kaspa-green light:text-emerald-700" /> How it resolves
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            title="Press to see where this is verified and the source"
            className="ml-auto inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green hover:bg-kaspa-green/10 hover:border-kaspa-green/50 transition-colors"
          >
            {realityLabel} <Info size={11} className="opacity-70" />
          </button>
        </div>
        <ol className="space-y-2.5">
          {flow.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-300 light:text-slate-700">
              <span className="shrink-0 w-5 h-5 rounded-full bg-kaspa-green/10 light:bg-emerald-50 border border-kaspa-green/30 light:border-emerald-200 text-kaspa-green light:text-emerald-700 text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-400 light:text-slate-600 mt-4 pt-3 border-t border-white/[0.06] light:border-slate-200 leading-relaxed">{flow.note}</p>
      </div>

      {/* Inline ZK test-prove: when this circuit has a real in-browser Groth16 prover, the user can
          generate + verify a proof here while configuring the covenant, using the SAME engine as the
          Build "Prove (ZK)" view. Collapsed by default so snarkjs only loads on demand. */}
      {canTestProve && (
        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.04] light:border-violet-200 light:bg-violet-50 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowProver((v) => !v)}
            aria-expanded={showProver}
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-violet-500/[0.06] light:hover:bg-violet-100/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
          >
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-violet-500/12 border border-violet-500/30 text-violet-300 light:bg-white light:text-violet-600 light:border-violet-200 shrink-0">
              <FlaskConical size={17} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-white light:text-slate-900">Test-prove this circuit in your browser</span>
              <span className="block text-[12px] text-gray-400 light:text-slate-600 leading-snug">
                Generate AND verify a real Groth16 proof here, before you deploy. No server, no oracle.
              </span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-gray-400 light:text-slate-500 transition-transform ${showProver ? 'rotate-180' : ''}`} />
          </button>
          {showProver && (
            <div className="px-5 pb-5">
              <FlagshipProver circuitId={circuit.id} />
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-gray-500 light:text-slate-500 leading-relaxed">
                <Info size={12} className="mt-0.5 shrink-0" />
                <span>
                  This is the same prove + verify engine as the Build{' '}
                  <Link to="/sandbox?mode=prove" className="text-violet-300 light:text-violet-700 hover:underline font-semibold">Prove (ZK)</Link>{' '}
                  view, which also lists every provable circuit. The proof is verified off-chain (here, by the counterparty, or any external verifier - snarkjs against the audited vkey, fail-closed) for the circom suite.
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Example covenant logic (SilverScript) - declared logic, regenerated live per circuit */}
      {exampleScript && (
        <div className="rounded-2xl border border-white/10 bg-black/40 light:border-slate-200 light:bg-slate-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 light:border-slate-200 flex items-center gap-2">
            <Code2 size={13} className="text-kaspa-green light:text-emerald-700" />
            <span className="text-[11px] uppercase tracking-wider text-gray-300 light:text-slate-700">Example covenant logic</span>
            <span className="text-[10px] text-gray-500 light:text-slate-500">SilverScript · declared</span>
            <button onClick={copyScript} className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-400 light:text-slate-500 hover:text-kaspa-green light:hover:text-emerald-700 transition-colors">
              {copied ? (<><Check size={12} className="text-kaspa-green" /> Copied</>) : (<><Copy size={12} /> Copy</>)}
            </button>
          </div>
          <pre className="text-[10.5px] leading-relaxed text-gray-300 light:text-slate-700 font-mono p-4 overflow-auto whitespace-pre-wrap break-words" style={{ maxHeight: 280 }}>{exampleScript}</pre>
          <div className="px-4 py-2 border-t border-white/[0.06] light:border-slate-200 text-[10px] text-gray-500 light:text-slate-500 leading-relaxed">
            This is the declared, human-readable logic. What the chain enforces today is shown in "How it resolves" above.
          </div>
        </div>
      )}

      {/* Payout simulator (interactive, faithful to on-chain math) */}
      {showSimulator && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-600 mb-2 flex items-center gap-2">
            <ArrowRight size={13} className="text-kaspa-green light:text-emerald-700" /> Simulate the economics
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
      <div className="rounded-xl border border-kaspa-green/20 light:border-emerald-200 bg-kaspa-green/5 light:bg-emerald-50 p-4 flex items-start gap-3 text-sm">
        <Sparkles size={16} className="text-kaspa-green light:text-emerald-700 mt-0.5 shrink-0" />
        <div className="text-gray-300 light:text-slate-700 leading-relaxed">
          <span className="text-white light:text-slate-900 font-semibold">Free to explore and simulate.</span> Inspecting the circuit, its real
          enforcement, and the payout math costs nothing and needs no wallet. To deploy a live covenant on Kaspa, open the
          builder below. All building is free. Paid tiers add priority placement and the premium website templates.
        </div>
      </div>
    </div>
  );
}
