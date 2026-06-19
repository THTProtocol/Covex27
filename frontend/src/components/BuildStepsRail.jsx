import React from 'react';
import { Check } from 'lucide-react';
import { useBuildStep } from '../lib/build-steps.js';

const STEPS = [
  { n: 1, label: 'Pick' },
  { n: 2, label: 'Logic' },
  { n: 3, label: 'Deploy' },
  { n: 4, label: 'Design' },
  { n: 5, label: 'Share' },
];

/**
 * BuildStepsRail
 * Sticky horizontal rail showing the 5 covenant build steps.
 * States are presentational only: the chips do not bind, sign, or broadcast
 * anything; they only navigate via the goTo() handler from useBuildStep().
 *
 * Honesty note: this is a UI breadcrumb, not an enforcement claim. The actual
 * consensus-enforced vs oracle co-signed reality is surfaced elsewhere.
 */
export default function BuildStepsRail({ compact = false }) {
  const ctx = useBuildStep() || {};
  const { current, goTo, isDone } = ctx;

  if (current == null) return null;

  const chipBase = compact
    ? 'inline-flex items-center justify-center shrink-0 rounded-full border font-bold transition-all snap-start'
    : 'inline-flex items-center gap-2 shrink-0 pl-1.5 pr-3 py-2 rounded-full border text-xs font-bold transition-all snap-start';
  const chipSize = compact ? 'w-7 h-7 text-[10px]' : '';

  const dotSize = compact ? 'w-5 h-5 text-[10px]' : 'w-5 h-5 text-[10px]';

  return (
    <div
      className={`relative sm:sticky sm:top-16 z-30 -mx-4 px-4 ${compact ? 'py-1.5' : 'py-3'} ${compact ? '' : 'mb-5'} bg-[#06070b]/85 light:bg-white/85 backdrop-blur-xl border-y border-white/[0.06] light:border-slate-200`}
      role="navigation"
      aria-label="Covenant build steps"
    >
      <div
        className="flex items-center gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-1 px-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {STEPS.map((s) => {
          const active = current === s.n;
          const done = typeof isDone === 'function' ? isDone(s.n) : current > s.n;
          const upcoming = !active && !done;
          const canGo = typeof goTo === 'function';

          const stateClasses = active
            ? 'border-kaspa-green/60 bg-kaspa-green text-white light:text-slate-900'
            : done
            ? 'border-emerald-300/60 ring-1 ring-emerald-300/40 bg-kaspa-green/[0.06] text-emerald-300 light:text-emerald-700 light:ring-emerald-600/40'
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

          const inner = compact ? (
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
  );
}
