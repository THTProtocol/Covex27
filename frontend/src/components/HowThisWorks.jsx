import { Info, ArrowRight, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * HowThisWorks
 *
 * Reusable instructional disclosure. Calm <details>/<summary> pattern with
 * an Info icon, optional inline summary, expandable body, and an optional
 * "Learn more" link.
 *
 * Honesty: copy passed in via props is the caller's responsibility. This
 * component imposes no claims; it just renders what it's given.
 *
 * Props:
 *   title       (string, required)  Short heading.
 *   summary     (string)            One-line description shown beside title.
 *   details     (ReactNode)         Body shown when opened.
 *   learnMore   (string)            Optional in-app route (react-router Link).
 *   className   (string)            Extra classes for the <details> wrapper.
 *   defaultOpen (boolean)           Open on first render.
 */
export default function HowThisWorks({
  title,
  summary,
  details,
  learnMore,
  className = '',
  defaultOpen = false,
}) {
  return (
    <details
      className={`group rounded-lg border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-3 hover:border-white/20 light:hover:border-slate-300 hover:bg-white/[0.04] light:hover:bg-slate-50 transition-colors min-h-[44px] ${className}`}
      open={defaultOpen}
    >
      <summary className="flex items-start gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
        <Info
          className="h-4 w-4 mt-0.5 shrink-0 text-cyan-400 light:text-cyan-700"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0 flex items-center gap-x-2 min-w-0">
          <span className="text-sm font-medium text-white light:text-slate-900">
            {title}
          </span>
          {summary && (
            <span className="text-xs text-gray-400 light:text-slate-600 truncate">
              {summary}
            </span>
          )}
        </div>
        <ChevronDown size={14} aria-hidden="true" className="text-gray-500 light:text-slate-500 shrink-0 motion-reduce:transition-none transition-transform group-open:rotate-180" />
      </summary>

      {(details || learnMore) && (
        <div className="mt-3 rounded-lg p-3 text-sm leading-relaxed bg-white/[0.03] light:bg-slate-50 text-gray-200 light:text-slate-700 space-y-2 break-words">
          {details}
          {learnMore && (
            <div className="pt-1">
              <Link
                to={learnMore}
                className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 light:text-cyan-700 light:hover:text-cyan-800"
              >
                Learn more
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
