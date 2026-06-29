import { useLocation } from 'react-router-dom';
import { Check } from '../lib/icons.js';
import { useBuildStep, BUILD_STEPS } from '../lib/build-steps.js';

// Single source of truth: BUILD_STEPS. The rail only needs { n, label }.
const STEPS = BUILD_STEPS.map(({ n, label }) => ({ n, label }));

// Routes where the rail should render in its tighter, dot-only form.
// Page Studio packs a lot of chrome under the rail already, so the full
// chip+label row pushed the canvas too far down.
const COMPACT_ROUTE = /^\/covenant\/[^/]+\/studio(\/|$)/;

/**
 * BuildStepsRail
 * Sticky horizontal rail showing the 5 covenant build steps.
 * States are presentational only: the chips do not bind, sign, or broadcast
 * anything; they only navigate via the goTo() handler from useBuildStep().
 *
 * Honesty note: this is a UI breadcrumb, not an enforcement claim. The actual
 * consensus-enforced vs resolver co-signed reality is surfaced elsewhere.
 *
 * `compact` may be passed explicitly; if omitted, it auto-switches on the
 * Page Studio route. Mounted exactly once globally from App.jsx.
 */
export default function BuildStepsRail({ compact }) {
  const ctx = useBuildStep() || {};
  const { current, goTo, isDone } = ctx;
  const location = useLocation();

  if (current == null) return null;

  const isCompact = compact === undefined ? COMPACT_ROUTE.test(location.pathname) : compact;

  // On a covenant-detail route (step 5 "Share") the rail's snap-x scroller overflows
  // with no affordance and eats ~70px of vertical space on a phone, above content the
  // visitor actually came to use. Hide it below sm there; it returns at sm+ where it
  // fits. Studio (compact) and the sandbox build flow keep the rail at every width.
  const COVENANT_DETAIL_ROUTE = /^\/covenant\/[^/]+(\/|$)/;
  const hideOnMobile = COVENANT_DETAIL_ROUTE.test(location.pathname) && !COMPACT_ROUTE.test(location.pathname);

  const chipBase = isCompact
    ? 'inline-flex items-center justify-center shrink-0 rounded-full border font-bold transition-all snap-start'
    : 'inline-flex items-center gap-2 shrink-0 pl-1.5 pr-3 py-2 rounded-full border text-xs font-bold transition-all snap-start';
  const chipSize = isCompact ? 'w-7 h-7 text-[10px]' : '';

  const dotSize = isCompact ? 'w-5 h-5 text-[10px]' : 'w-5 h-5 text-[10px]';

  return (
    <div
      className={`${hideOnMobile ? 'hidden sm:block' : ''} relative sm:sticky sm:top-16 z-30 ${isCompact ? 'py-1.5' : 'py-3'} ${isCompact ? 'mb-3' : 'mb-6'} bg-[#06070b]/85 light:bg-white/85 backdrop-blur-xl border-y border-white/[0.06] light:border-slate-200`}
      role="navigation"
      aria-label="Covenant build steps"
    >
      {/* Centered container matches the nav header (max-w-6xl px-4) so the chips
          line up under the logo instead of bleeding off the viewport edge. The
          bar background/border stays full-bleed; only the chip row is inset. */}
      <div className="max-w-6xl mx-auto px-4">
        <div
          className="flex items-center gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-none py-1 -mx-1 px-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {STEPS.map((s) => {
          const active = current === s.n;
          const done = typeof isDone === 'function' ? isDone(s.n) : current > s.n;
          // goTo() only navigates the sandbox phases (steps 1-3). Steps 4-5 live on
          // a covenant route goTo cannot reach, so they render as an inert span
          // instead of a button that silently no-ops on click.
          const canGo = typeof goTo === 'function' && [1, 2, 3].includes(s.n);

          const stateClasses = active
            ? 'border-kaspa-green/60 bg-kaspa-green text-white light:bg-emerald-700 light:text-white light:border-emerald-700'
            : done
            ? 'border-emerald-300/60 ring-1 ring-emerald-300/40 bg-kaspa-green/[0.06] text-emerald-300 light:text-emerald-700 light:ring-emerald-600/40 light:border-emerald-600/40'
            : 'border-white/10 bg-white/10 text-gray-400 hover:border-white/25 light:border-slate-200 light:bg-slate-100 light:text-slate-500';

          const dotClasses = active
            ? 'bg-white/20 text-white light:bg-slate-900/15 light:text-slate-900'
            : done
            ? 'bg-emerald-300/20 text-emerald-300 light:text-emerald-700'
            : 'bg-white/10 text-gray-400 light:bg-slate-200 light:text-slate-500';

          const commonProps = {
            'aria-current': active ? 'step' : undefined,
            'aria-label': `Step ${s.n}: ${s.label}${active ? ' (current)' : done ? ' (done)' : ''}`,
            title: `${s.n}. ${s.label}`,
            className: `${chipBase} ${chipSize} ${stateClasses}`,
          };

          const inner = isCompact ? (
            done ? <Check size={12} /> : s.n
          ) : (
            <>
              <span className={`rounded-full flex items-center justify-center ${dotSize} ${dotClasses}`}>
                {done ? <Check size={11} /> : s.n}
              </span>
              {s.label}
            </>
          );

          if (!canGo) {
            return (
              <span key={s.n} {...commonProps}>
                {inner}
              </span>
            );
          }

          return (
            <button key={s.n} type="button" onClick={() => goTo(s.n)} {...commonProps}>
              {inner}
            </button>
          );
          })}
        </div>
      </div>
    </div>
  );
}
