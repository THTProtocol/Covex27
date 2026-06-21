// CovenantDetailSkeleton.jsx - structured loading placeholder for the covenant detail page.
//
// Mirrors the real interact-page silhouette: a leading enforcement-badge bar, then the
// two-column grid (metadata panel on the left, action panel on the right). This keeps the
// layout stable as the real content streams in, instead of flashing a centered spinner and
// then snapping into a tall two-column layout.
//
// Built from the shared `.skeleton` utility (brand-teal shimmer, auto-disabled under
// prefers-reduced-motion) inside the same glass-panel chrome, so it inherits light + dark +
// mobile parity. The whole block is aria-hidden; the wrapper owns the single role="status".
//
// Honesty: this only signals "data is loading" while we fetch the covenant from the BlockDAG.

import * as React from 'react';
import { Skeleton } from './Skeleton';

function PanelSkeleton({ lines = 4 }) {
  return (
    <div className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-5 light:bg-white light:border light:border-slate-200">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3 rounded-lg" />
          <Skeleton className="h-3 w-1/3 rounded" />
        </div>
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-3 rounded ${i === lines - 1 ? 'w-3/5' : 'w-full'}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl mt-1" />
    </div>
  );
}

export default function CovenantDetailSkeleton() {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-12 pb-12"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading covenant from the BlockDAG...</span>
      {/* Back link placeholder */}
      <Skeleton className="h-4 w-40 rounded mb-6" aria-hidden="true" />
      {/* Enforcement badge bar (leads the real page) */}
      <Skeleton className="h-16 w-full rounded-2xl mb-6" aria-hidden="true" />
      {/* Two-column grid mirroring the metadata + action panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" aria-hidden="true">
        <PanelSkeleton lines={5} />
        <PanelSkeleton lines={4} />
      </div>
    </div>
  );
}
