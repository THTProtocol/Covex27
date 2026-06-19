// Skeleton.jsx - reusable Covex loading-placeholder primitive.
//
// Thin wrapper around the existing `.skeleton` utility in index.css: a muted
// rounded block with a slow brand-teal shimmer sweep that disables itself under
// prefers-reduced-motion. Light + dark + mobile @375px parity is inherited from
// the shared CSS, so every Skeleton across the app shimmers identically.
//
// Sizing stays with the caller (height/width via Tailwind className), exactly
// like the inline `h-X w-Y rounded animate-pulse` divs it replaces. Defaults
// to a `<div>`; pass `as="span"` for inline contexts (e.g. inside a label).
//
// A11y: a Skeleton is decorative (the real "loading" announcement should sit on
// the closest container via aria-busy / role="status" / sr-only "Loading X").
// We mark each block aria-hidden so a screen reader sees one status line, not
// a dozen "loading" announcements per panel.
//
// Honesty: this primitive ONLY indicates "data is loading". It must not be
// used to hide content the user has permission to see or to suggest progress
// that is not actually happening.

import * as React from 'react';
import { cn } from '@/lib/utils';

const Skeleton = React.forwardRef(function Skeleton(
  { className, as: Tag = 'div', ...props },
  ref
) {
  return (
    <Tag
      ref={ref}
      aria-hidden="true"
      className={cn('skeleton', className)}
      {...props}
    />
  );
});

export { Skeleton };
export default Skeleton;
