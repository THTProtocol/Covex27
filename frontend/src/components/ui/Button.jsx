/* eslint-disable react-refresh/only-export-components -- this module intentionally co-exports its component(s) with related constants/hooks/helpers (e.g. a Provider plus its useX hook). That only affects dev Fast Refresh granularity, never the production build or tests; splitting these into separate files is not warranted here. */
// Button.jsx - premium, reusable Covex button primitive.
//
// An API-compatible superset of the legacy ui/Button.tsx: every existing variant
// and size still resolves identically, so current call sites keep working. It adds
// premium variants (kaspa, gold, glass, danger) and a `shimmer` convenience prop
// that layers the .btn-shimmer sweep. Brand: Kaspa teal #49EACB + gold #E8AF34.
// Future cycles can adopt this without touching today's screens.

import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[transform,box-shadow,background-color,border-color,color] duration-[160ms] ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#49EACB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#05050A] light:focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Legacy-compatible variants (keep names + behavior stable).
        default:
          'bg-[#49EACB] text-black hover:bg-[#3cd8b6] hover:shadow-[0_0_22px_rgba(73,234,203,0.35)] light:bg-[#0f766e] light:text-white light:hover:bg-[#115e59]',
        destructive: 'bg-red-500 text-white hover:bg-red-600 light:bg-red-600',
        outline:
          'border border-white/20 bg-transparent text-white hover:bg-white/5 hover:border-white/35 light:border-slate-300 light:text-slate-700 light:hover:bg-slate-100',
        secondary:
          'bg-white/10 text-white hover:bg-white/20 light:bg-slate-100 light:text-slate-900 light:hover:bg-slate-200',
        ghost: 'text-white hover:bg-white/10 light:hover:bg-slate-100 light:text-slate-700',
        link: 'text-[#49EACB] underline-offset-4 hover:underline light:text-[#0f766e]',
        // Premium additions.
        kaspa:
          'bg-[#49EACB] text-black hover:brightness-110 hover:shadow-[0_0_24px_rgba(73,234,203,0.4)] light:bg-[#0f766e] light:text-white',
        gold:
          'bg-[#E8AF34] text-black hover:brightness-110 hover:shadow-[0_0_24px_rgba(232,175,52,0.4)] light:bg-[#b8860b] light:text-white light:hover:bg-[#9a6f08]',
        glass:
          'border border-white/10 bg-white/[0.06] text-white backdrop-blur-sm hover:bg-white/[0.1] hover:border-white/20 light:bg-slate-100 light:hover:bg-slate-200 light:border-slate-200 light:hover:border-slate-300 light:text-slate-700 light:backdrop-blur-none',
        danger:
          'bg-red-500/90 text-white hover:bg-red-500 hover:shadow-[0_0_22px_rgba(248,113,113,0.35)] light:bg-red-600 light:!text-white light:hover:bg-red-700',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-12 px-8 text-base',
        xl: 'h-14 px-9 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(function Button(
  { className, variant, size, shimmer = false, asChild = false, type, children, ...props },
  ref
) {
  const classes = cn(buttonVariants({ variant, size }), shimmer && 'btn-shimmer', className);

  if (asChild) {
    // Radix-style slot: clone the single child so consumers can wrap a Link/anchor
    // without losing focus-visible, active:scale, and press semantics.
    const child = React.Children.only(children);
    return React.cloneElement(child, {
      ref,
      ...props,
      className: cn(child.props.className, classes),
    });
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
});

export { Button };
export default Button;
