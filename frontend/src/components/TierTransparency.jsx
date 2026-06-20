import { Check, Sparkles, ShieldCheck, ArrowUpRight } from 'lucide-react';

// TierTransparency
// ─────────────────
// The single, authoritative, always-visible statement of what Covex does and
// does not gate. It is rendered identically in the Covex Terminal (every tier,
// all the time) and on the Pricing page so the message can never drift between
// the two surfaces.
//
// Honesty rule (absolute): paid = priority PLACEMENT only, never capability.
// Every line below must reflect that. If you edit the copy, edit it here once;
// both surfaces re-render from this component.
//
// Renders correctly in BOTH dark (default) and light (`light:` variants) mode.
// No em dashes anywhere (strict byte gate) - hyphens only.

const INCLUDED = [
  'Build and deploy any covenant - every ZK circuit, every game, every primitive',
  'Pick any resolution - oracle-attested or a real in-browser ZK proof (Groth16)',
  'Lock any amount of KAS - no cap on stakes, pots, or bets',
  'Ship a full custom website for your covenant in Covenant Studio',
  'Deploy non-custodially - your wallet signs; Covex never holds your keys',
  'Claim your funds even if Covex is down (offline recovery tool)',
];

export default function TierTransparency({ currentTier = 'FREE' }) {
  const tier = (currentTier || 'FREE').toUpperCase();
  const isFree = tier === 'FREE';

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6 space-y-6 backdrop-blur-sm light:border-slate-200 light:bg-white light:shadow-sm">
      {/* Included on every tier */}
      <div>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-1.5 rounded-lg bg-kaspa-green/15 border border-kaspa-green/25 light:bg-emerald-100 light:border-emerald-300 shrink-0">
            <Check size={15} className="text-kaspa-green light:text-[#14B8A6]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white light:text-slate-900 tracking-tight">
              Included on every tier (Free included)
            </h3>
            <p className="text-xs text-gray-300 light:text-slate-600 mt-0.5">
              Covex never gates what you can build.
            </p>
          </div>
        </div>
        <ul className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
          {INCLUDED.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-sm text-gray-200 light:text-slate-700 leading-snug">
              <Check size={15} className="shrink-0 mt-0.5 text-kaspa-green light:text-[#14B8A6]" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="h-px bg-white/[0.07] light:bg-slate-200" aria-hidden="true" />

      {/* What a paid tier adds */}
      <div>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 light:bg-amber-100 light:border-amber-300 shrink-0">
            <Sparkles size={15} className="text-amber-400 light:text-amber-600" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white light:text-slate-900 tracking-tight">
              What a paid tier adds - priority placement only
            </h3>
            <p className="text-xs text-gray-300 light:text-slate-600 mt-0.5">
              Paid tiers do not unlock any feature.
            </p>
          </div>
        </div>
        <ul className="mt-3.5 space-y-2.5">
          <li className="flex items-start gap-2.5 text-sm text-gray-200 light:text-slate-700 leading-snug">
            <ArrowUpRight size={15} className="shrink-0 mt-0.5 text-amber-400 light:text-amber-600" aria-hidden="true" />
            <span>Priority placement and featured listing of your covenant and its website (higher in the Explorer and Markets)</span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-gray-300 light:text-slate-600 leading-relaxed">
          Your covenant deploys and works identically on Free. Paid only changes where it appears on Covex.
        </p>
      </div>

      {/* Current-tier line - reflects the real currentTier prop */}
      <div className="flex items-start gap-2.5 rounded-xl border border-kaspa-green/20 bg-kaspa-green/[0.04] px-3.5 py-3 light:border-emerald-300 light:bg-emerald-50">
        <ShieldCheck size={16} className="shrink-0 mt-0.5 text-kaspa-green light:text-[#14B8A6]" aria-hidden="true" />
        <p className="text-xs sm:text-sm text-gray-200 light:text-slate-700 leading-relaxed">
          {isFree ? (
            <>
              <span className="font-semibold text-white light:text-slate-900">Your tier: FREE</span>
              {' - everything above is active. The only thing not active is priority placement, the paid add-on.'}
            </>
          ) : (
            <>
              <span className="font-semibold text-white light:text-slate-900">Your tier: {tier}</span>
              {' - priority placement is active.'}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
