import { CheckCircle2 } from '../lib/routeIcons.js';

/**
 * Live indicator for the covenant fork: covenants are live on Kaspa. The earlier
 * scheduled-countdown variant of this component is obsolete now that covenants
 * are live, so this renders a simple, honest "live on Kaspa" badge. Kept as a
 * component (rather than deleted) so its existing callers render unchanged.
 */
export default function ToccataStatus() {
  return (
    <div className="mb-5 rounded-2xl border border-kaspa-green/30 bg-kaspa-green/[0.06] light:bg-kaspa-green/10 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-kaspa-green opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-kaspa-green" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CheckCircle2 size={16} className="text-kaspa-green shrink-0" />
            <span className="text-sm sm:text-base font-bold text-white light:text-slate-900 break-words">Native covenants are live on Kaspa</span>
          </div>
          <p className="text-[11px] text-gray-300 light:text-slate-600 mt-1 leading-relaxed break-words">
            The covenant fork has activated, so the SilverScript covenant opcodes Covex builds on run on Kaspa today.
          </p>
        </div>
      </div>
    </div>
  );
}
