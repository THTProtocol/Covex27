// Badge.jsx - premium, reusable Covex badge / chip primitive.
//
// API-compatible superset of the legacy ui/Badge.tsx: every existing variant
// (default, secondary, destructive, outline, max, pro, builder) keeps the same
// look, so current call sites keep working. Adds the honest enforcement-reality
// chips used across the app (on-chain, oracle, hybrid, full-zk, metadata) plus
// a `dot` option for a small leading status dot. Reality labels stay accurate
// by design: on-chain = Kaspa consensus enforces it; oracle = the disclosed
// oracle attests; full-zk = a real proof the Covex oracle verifies fail-closed;
// metadata = label only.
//
// CANONICAL ENFORCEMENT-REALITY PALETTE (single source of truth, mirrored in
// TrustBadge.jsx). Honesty palette is load-bearing brand: the same honesty word
// must render the same color everywhere or readers stop trusting any of them.
//   on-chain   = emerald  (consensus-enforced, the strongest signal)
//   hybrid     = sky      (script + oracle input)
//   oracle     = amber    (signed attestation only)
//   full-zk    = violet   (real proof, oracle-verified, not on-chain)
//   metadata   = slate    (label only, no enforcement)
// NOTE: full-zk previously used the brand teal #49EACB, which made an
// oracle-verified proof read as MORE prominent than on-chain consensus. The
// brand teal stays reserved for primary CTAs / consensus signals; violet keeps
// full-zk honest as "verified by Covex's disclosed oracle, not by the chain".

import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        // Legacy-compatible variants.
        default: 'border-transparent bg-[#49EACB] text-black hover:bg-[#3cd8b6]',
        secondary: 'border-transparent bg-white/10 text-white hover:bg-white/20',
        destructive: 'border-transparent bg-red-500/80 text-white hover:bg-red-500',
        outline: 'text-white border-white/30',
        max: 'border-purple-500/40 bg-purple-500/15 text-purple-300',
        pro: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
        builder: 'border-[#49EACB]/40 bg-[#49EACB]/15 text-[#49EACB]',
        // Honest enforcement-reality chips (canonical palette - see file header).
        'on-chain': 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
        hybrid:    'border-sky-500/40 bg-sky-500/15 text-sky-300',
        oracle:    'border-amber-500/40 bg-amber-500/15 text-amber-300',
        'full-zk': 'border-violet-500/40 bg-violet-500/15 text-violet-300',
        metadata:  'border-slate-400/30 bg-slate-400/10 text-slate-300',
        decorative:'border-slate-400/30 bg-slate-400/10 text-slate-300',
        gold:      'border-[#E8AF34]/40 bg-[#E8AF34]/15 text-[#E8AF34]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const DOT = {
  'on-chain': 'bg-emerald-400',
  hybrid:     'bg-sky-400',
  oracle:     'bg-amber-400',
  'full-zk':  'bg-violet-400',
  metadata:   'bg-slate-400',
  decorative: 'bg-slate-400',
  gold:       'bg-[#E8AF34]',
};

function Badge({ className, variant, dot = false, children, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT[variant] || 'bg-current')} aria-hidden="true" />}
      {children}
    </div>
  );
}

export { Badge };
export default Badge;
