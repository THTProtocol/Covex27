import { ShieldCheck, AlertTriangle, KeyRound, Radio, Cpu } from '../lib/routeIcons.js';
import { REALITY_HEADLINE, KNOWN_REALITIES } from '../lib/enforcement-copy';

// In-flow, per-deploy honesty disclosure shown AT THE MOMENT OF DEPLOY (not only later
// on the covenant page). It states the true enforcement reality + the non-custodial,
// no-recovery facts plainly - the concrete shield against misrepresentation and the
// honest framing the trustless story depends on.
//
// reality keys are the app-wide canonical vocabulary from lib/enforcement-copy.js:
//   'on-chain'        - Kaspa consensus enforces the redeem script (trustless)
//   'hybrid'          - on-chain custody/payout, but a external resolver gates which
//                       branch releases (markets, oracle covenants) - NOT trustless
//   'oracle-attested' - a external resolver co-signs the outcome - NOT trustless
//   'full-zk'         - a Groth16 proof verified off-chain by the oracle, then co-signed
//
// Hybrid / oracle-attested / full-zk MUST NEVER render the old "metadata / not enforced"
// copy: that scary line was a fall-through bug that contradicted the on-chain hero copy
// directly above it at the moment of committing funds.
export default function DeployDisclosure({ reality = 'on-chain', className = '' }) {
  const key = KNOWN_REALITIES.has(reality) ? reality : 'on-chain';
  const isOnChain = key === 'on-chain';
  const isOracle = key === 'oracle-attested';
  const isHybrid = key === 'hybrid';
  const isFullZk = key === 'full-zk';
  const trustless = isOnChain; // only pure consensus-enforced is trustless

  const tone = isOnChain
    ? { wrap: 'border-emerald-500/25 bg-emerald-500/[0.04]', head: 'text-emerald-300 light:text-emerald-700', Icon: ShieldCheck }
    : isFullZk
      ? { wrap: 'border-sky-500/25 bg-sky-500/[0.04]', head: 'text-sky-300 light:text-sky-700', Icon: Cpu }
      : { wrap: 'border-sky-500/25 bg-sky-500/[0.04]', head: 'text-sky-300 light:text-sky-700', Icon: Radio };

  const headline = REALITY_HEADLINE[key];

  return (
    <div className={`rounded-xl border p-4 ${tone.wrap} ${className}`}>
      <div className={`flex items-center gap-2 text-sm font-semibold mb-2 ${tone.head}`}>
        <tone.Icon size={16} /> {headline}
      </div>
      <ul className="space-y-1.5 text-[11px] text-gray-300 light:text-slate-600 leading-relaxed">
        <li className="flex gap-2"><span className="text-gray-500">•</span> Enforced by code. A bug in the script can lose funds, and there is no undo.</li>
        <li className="flex gap-2"><span className="text-gray-500">•</span> Covex is non-custodial: it cannot recover, freeze, reverse, or move your funds.</li>
        <li className="flex gap-2"><KeyRound size={13} className="text-kaspa-green/80 mt-px shrink-0" /> You hold your keys. You sign in your browser; the key never reaches our server.</li>
        {isOnChain && <li className="flex gap-2"><span className="text-gray-500">•</span> The chain enforces the rules - no oracle, no trust in Covex. Save your redeem script to spend even if Covex is gone.</li>}
        {isHybrid && <li className="flex gap-2"><span className="text-gray-500">•</span> Custody and payout settle on-chain, but which branch releases is decided by an external resolver (a revealed market outcome, or a proof it verifies). This is NOT trustless.</li>}
        {isOracle && <li className="flex gap-2"><span className="text-gray-500">•</span> The outcome is co-signed by an external resolver (checked off-chain), not by Kaspa consensus alone. This is NOT trustless.</li>}
        {isFullZk && <li className="flex gap-2"><span className="text-gray-500">•</span> A real Groth16 proof is verified off-chain by an external resolver, then co-signed on-chain. Payout still needs that external resolver's co-signature, so it is NOT trustless end-to-end.</li>}
        {!trustless && <li className="flex gap-2"><AlertTriangle size={13} className="text-amber-400/80 light:text-amber-600 mt-px shrink-0" /> The external resolver cannot take your funds, but it can withhold the co-signature, so settlement depends on it staying live and honest.</li>}
      </ul>
    </div>
  );
}
