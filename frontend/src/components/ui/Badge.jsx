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
//   on-chain      = emerald  (consensus-enforced, the strongest signal)
//   hybrid        = sky      (script + oracle input)
//   oracle        = amber    (signed attestation only)
//   full-zk       = violet   (real proof, oracle-verified, not on-chain)
//   full-zk-chain = violet + emerald left-rail (the 4-of-19 circuits whose
//                   proof reduces to a chain-enforced hashlock; end-to-end
//                   honest, not just oracle-verified)
//   metadata      = slate    (label only, no enforcement)
// NOTE: full-zk previously used the brand teal #49EACB, which made an
// oracle-verified proof read as MORE prominent than on-chain consensus. The
// brand teal stays reserved for primary CTAs / consensus signals; violet keeps
// full-zk honest as "verified by Covex's disclosed oracle, not by the chain".
// full-zk-chain inherits that violet base then adds an emerald left rail so the
// upgrade reads as "violet proof PLUS emerald consensus enforcement" at a glance.

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
        // PRO tier uses Kaspa-gold (#E8AF34, mirrors tierPalette.js) NOT generic
        // amber, so it never collides with the honesty `oracle` chip. The dot
        // prefix is the strongest disambiguator at card-corner sizes: it makes
        // the chip read as a tier marker, not an enforcement chip.
        pro: 'border-[#E8AF34]/40 bg-[#E8AF34]/15 text-[#E8AF34] light:border-[#B45309]/60 light:bg-[#FEF3C7] light:text-[#92400E]',
        builder: 'border-[#49EACB]/40 bg-[#49EACB]/15 text-[#49EACB]',
        // Honest enforcement-reality chips (canonical palette - see file header).
        // Each variant carries explicit light: overrides so the sacred honesty
        // palette stays >= 4.5:1 against #ffffff. Without these, the full-zk
        // and metadata chips render at ~1.5:1 on the light glass surfaces.
        'on-chain': 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 light:border-emerald-600/60 light:bg-emerald-50 light:text-emerald-700',
        hybrid:    'border-sky-500/40 bg-sky-500/15 text-sky-300 light:border-sky-600/60 light:bg-sky-50 light:text-sky-700',
        oracle:    'border-amber-500/40 bg-amber-500/15 text-amber-300 light:border-amber-600/60 light:bg-amber-50 light:text-amber-700',
        'full-zk': 'border-violet-500/40 bg-violet-500/15 text-violet-300 light:border-violet-600/60 light:bg-violet-50 light:text-violet-700',
        // Same violet base as full-zk, but with an emerald left rail to signal
        // that consensus also enforces the payout (the 4-of-19 chain-enforced
        // circuits). The double border keeps both signals readable in mono
        // print and at card-corner sizes.
        'full-zk-chain': 'border-violet-500/40 bg-violet-500/15 text-violet-300 light:border-violet-600/60 light:bg-violet-50 light:text-violet-700 border-l-2 border-l-emerald-400 light:border-l-emerald-600',
        metadata:  'border-slate-400/30 bg-slate-400/10 text-slate-300 light:border-slate-300 light:bg-slate-100 light:text-slate-700',
        decorative:'border-slate-400/30 bg-slate-400/10 text-slate-300 light:border-slate-300 light:bg-slate-100 light:text-slate-600',
        gold:      'border-[#E8AF34]/40 bg-[#E8AF34]/15 text-[#E8AF34] light:border-amber-600/60 light:bg-amber-50 light:text-amber-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

// Light-mode 600-shade overrides on every honesty dot: the dark 400-shades sit
// at ~1.7:1 against the light 50 chip backgrounds, which inverts the honesty
// hierarchy (on-chain reads weakest). The 600-shade hits ~4.5:1 so on-chain
// stays the strongest signal in BOTH themes. Dot size stays 1.5px (set on the
// span) so light-mode weight matches dark.
const DOT = {
  'on-chain': 'bg-emerald-400 light:bg-emerald-600',
  hybrid:     'bg-sky-400 light:bg-sky-600',
  oracle:     'bg-amber-400 light:bg-amber-600',
  'full-zk':  'bg-violet-400 light:bg-violet-600',
  // Same violet dot as full-zk. The emerald left rail on the chip itself
  // (border-l-emerald-*) already carries the "consensus also enforces" signal,
  // so a split violet/emerald dot would just add noise at 1.5px.
  'full-zk-chain': 'bg-violet-400 light:bg-violet-600',
  metadata:   'bg-slate-400 light:bg-slate-500',
  decorative: 'bg-slate-400 light:bg-slate-500',
  gold:       'bg-[#E8AF34]',
  pro:        'bg-[#E8AF34]',
  max:        'bg-purple-400 light:bg-purple-600',
  builder:    'bg-[#49EACB]',
};

// Paid-tier chips ALWAYS render with a leading dot so they read as tier
// markers, not enforcement-reality chips. Without this, a top-right `PRO`
// chip and a top-left `oracle` honesty chip on the same Explorer card
// rendered as visually identical amber rectangles. Sacred honesty palette
// (oracle = amber) stays unchanged; PRO moves to its real Kaspa-gold token.
const FORCED_DOT_VARIANTS = new Set(['pro', 'max', 'builder']);

function Badge({ className, variant, dot = false, children, ...props }) {
  const showDot = dot || FORCED_DOT_VARIANTS.has(variant);
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {showDot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT[variant] || 'bg-current')} aria-hidden="true" />}
      {children}
    </div>
  );
}

export { Badge };
export default Badge;
