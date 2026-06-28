// CovenantCardSkeleton.jsx - structured loading placeholder for the Explorer covenant grid.
//
// Mirrors the real CovenantCard silhouette (top accent bar, header badge row, title +
// description lines, stat row, footer) so the loading state reads as "cards arriving",
// not "a blank gray box". Reusing the shape also keeps layout shift near zero when the
// real cards swap in.
//
// Built entirely from the shared `.skeleton` utility (the same brand-teal shimmer the
// rest of the app uses, auto-disabled under prefers-reduced-motion) plus the card's own
// border/gradient chrome, so it inherits light + dark + mobile parity for free.
//
// Honesty: this only signals "data is loading". The whole block is aria-hidden; the
// grid container owns the single role="status" / aria-busy announcement.

import { Skeleton } from './Skeleton';

export default function CovenantCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="relative flex flex-col rounded-2xl border border-white/[0.06] light:border-slate-200 overflow-hidden bg-gradient-to-br from-[#15151f] via-[#0e0e16] to-[#0a0a0f] light:from-white light:via-white light:to-slate-50 min-h-[340px]"
    >
      {/* Top accent bar (matches CovenantCard's 3px identity bar) */}
      <div className="h-[3px] w-full shrink-0 bg-gradient-to-r from-transparent via-white/10 light:via-slate-300 to-transparent" />

      {/* Header row: a couple of badge pills + a right-aligned id chip */}
      <div className="relative h-12 shrink-0 px-3.5 flex items-center justify-between gap-2 bg-white/[0.015] light:bg-slate-50">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-14 rounded-md" />
          <Skeleton className="h-4 w-16 rounded-md" />
        </div>
        <Skeleton className="h-3.5 w-20 rounded-md" />
      </div>

      {/* Body: title, two description lines, a stat row */}
      <div className="flex-1 flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-3/5 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-4/5 rounded" />
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 pt-2">
          <Skeleton className="h-9 rounded-xl" />
          <Skeleton className="h-9 rounded-xl" />
          <Skeleton className="h-9 rounded-xl" />
        </div>
      </div>

      {/* Footer: status dot + timestamp */}
      <div className="px-4 py-3 border-t border-white/[0.05] light:border-slate-200 flex items-center justify-between">
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-3 w-24 rounded" />
      </div>
    </div>
  );
}
