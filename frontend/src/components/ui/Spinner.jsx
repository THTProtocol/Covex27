// Spinner.jsx - reusable Covex spinner primitive.
//
// A single, consistent loading spinner so every async action across the app
// looks the same: a thin two-tone ring that rotates on the brand axis. Built
// from the `animate-spin` Tailwind class (which respects prefers-reduced-motion
// the same way every other CSS animation in the app does, via the global
// reduced-motion override in index.css).
//
// Variants are intent-based, not color-coded by hand at the callsite:
//   - brand  (default) brand teal on transparent  for page/section loaders
//   - inverse                  black ring on the brand teal/black button surface
//   - white                    white ring  for dark-button surfaces
//   - mono                     uses currentColor   for inline-with-text spinners
//
// Sizes map to the four heights already in the codebase (xs/sm/md/lg = 12/16/20/32 px).
//
// A11y: `role="status"` + `aria-label` so a spinner alone communicates a busy
// state. When a parent already declares `aria-busy`/`aria-label`, pass
// `aria-hidden` so the SR only hears the parent's announcement once.

import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const spinnerVariants = cva(
  'inline-block rounded-full border-solid animate-spin shrink-0',
  {
    variants: {
      variant: {
        // brand teal #49EACB on transparent. Default for page / section loaders.
        brand:   'border-[#49EACB]/30 border-t-[#49EACB]',
        // Black ring on a teal button (light-mode default buttons are teal+black).
        inverse: 'border-black/30 border-t-black',
        // White ring on a dark button.
        white:   'border-white/30 border-t-white',
        // Inherits text color  use inside an icon slot next to text.
        mono:    'border-current/30 border-t-current opacity-80',
      },
      size: {
        xs: 'w-3  h-3  border-2',
        sm: 'w-4  h-4  border-2',
        md: 'w-5  h-5  border-2',
        lg: 'w-8  h-8  border-2',
        xl: 'w-10 h-10 border-2',
      },
    },
    defaultVariants: { variant: 'brand', size: 'md' },
  }
);

const Spinner = React.forwardRef(function Spinner(
  { className, variant, size, label = 'Loading', ...props },
  ref
) {
  return (
    <span
      ref={ref}
      role="status"
      aria-label={label}
      className={cn(spinnerVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { Spinner };
export default Spinner;
