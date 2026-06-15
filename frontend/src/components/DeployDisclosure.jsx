import { ShieldCheck, AlertTriangle, KeyRound, Radio } from 'lucide-react';

// In-flow, per-deploy honesty disclosure shown AT THE MOMENT OF DEPLOY (not only later
// on the covenant page). It states the true enforcement reality + the non-custodial,
// no-recovery facts plainly - the concrete shield against misrepresentation and the
// honest framing the trustless story depends on.
//
// reality: 'on-chain' (Kaspa consensus enforces it) | 'oracle-attested' (a disclosed
// oracle co-signs) | 'metadata' (recorded but NOT enforced).
export default function DeployDisclosure({ reality = 'on-chain', className = '' }) {
  const isOnChain = reality === 'on-chain';
  const isOracle = reality === 'oracle-attested';
  const tone = isOnChain
    ? { wrap: 'border-emerald-500/25 bg-emerald-500/[0.04]', head: 'text-emerald-300', Icon: ShieldCheck }
    : { wrap: 'border-amber-500/25 bg-amber-500/[0.04]', head: 'text-amber-300', Icon: isOracle ? Radio : AlertTriangle };
  const headline = isOnChain
    ? 'On-chain enforced by Kaspa consensus'
    : isOracle
      ? 'Oracle-attested + ZK-private (a disclosed oracle co-signs the outcome)'
      : 'Metadata only - not enforced by consensus';
  return (
    <div className={`rounded-xl border p-4 ${tone.wrap} ${className}`}>
      <div className={`flex items-center gap-2 text-sm font-semibold mb-2 ${tone.head}`}>
        <tone.Icon size={16} /> {headline}
      </div>
      <ul className="space-y-1.5 text-[11px] text-gray-300 leading-relaxed">
        <li className="flex gap-2"><span className="text-gray-500">•</span> Enforced by code. A bug in the script can lose funds, and there is no undo.</li>
        <li className="flex gap-2"><span className="text-gray-500">•</span> Covex is non-custodial: it cannot recover, freeze, reverse, or move your funds.</li>
        <li className="flex gap-2"><KeyRound size={13} className="text-kaspa-green/80 mt-px shrink-0" /> You hold your keys. You sign in your browser; the key never reaches our server.</li>
        {isOnChain && <li className="flex gap-2"><span className="text-gray-500">•</span> The chain enforces the rules - no oracle, no trust in Covex. Save your redeem script to spend even if Covex is gone.</li>}
        {isOracle && <li className="flex gap-2"><span className="text-gray-500">•</span> The outcome depends on the disclosed oracle (checked off-chain), not on Kaspa consensus alone. This is NOT trustless.</li>}
        {reality === 'metadata' && <li className="flex gap-2"><span className="text-gray-500">•</span> The chain records this covenant but does NOT enforce its stated logic. Treat it as a label, not a guarantee.</li>}
      </ul>
    </div>
  );
}
