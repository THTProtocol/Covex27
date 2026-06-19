// Card.jsx - premium, reusable Covex card primitive.
//
// API-compatible superset of the legacy ui/Card.tsx: Card, CardHeader, CardTitle,
// CardDescription, CardContent, CardFooter all keep their exact signatures and
// default look, so existing call sites keep working. Card adds opt-in premium
// props: `hover` (the .hover-lift micro-interaction), `hero` (the
// .detail-hero-enhanced teal glow), and `accent` (a 3px identity-hue accent bar
// at the top, matching the CovenantCard / TemplateLibrary design vocabulary).

import * as React from 'react';
import { cn } from '@/lib/utils';

// Defense in depth: the optional `accent` prop is interpolated into an inline
// linear-gradient, so guard it even though no current caller passes user input.
// Accept only #hex, rgb()/rgba(), hsl()/hsla(), or a plain CSS color word; reject
// anything that could break out of the value (url(), expression, ;, braces, etc).
const SAFE_ACCENT = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%/]+\)|hsla?\([\d.,\s%/]+\)|[a-zA-Z]{3,20})$/;
const safeAccent = (c) => (typeof c === 'string' && SAFE_ACCENT.test(c.trim()) ? c.trim() : '#49EACB');

// `interactive` layers premium press feedback for cards-as-links / cards-as-buttons.
// `asChild` lets a wrapper (e.g. <Link>) be the actual element so the focus ring
// and press animation land on the link, not a nested div - critical for cards
// in Explorer / PremiumBuilder / TemplateLibrary that wrap a router Link.
const Card = React.forwardRef(function Card(
  { className, hover = false, hero = false, interactive = false, accent, asChild = false, children, style, ...props },
  ref
) {
  const classes = cn(
    'relative rounded-2xl border border-white/10 bg-zinc-900/80 text-white shadow-sm backdrop-blur-sm',
    'light:bg-white light:border-slate-200 light:text-slate-900 light:shadow-sm',
    hover && 'hover-lift',
    hero && 'detail-hero-enhanced',
    // The :focus-visible ring matches the rounded-2xl corner via offset so the
    // outline never reads as a square stuck outside the card. The /60 alpha
    // keeps it premium-brand without screaming on hover-into-focus transitions.
    interactive && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#49EACB]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05050A] light:focus-visible:ring-offset-white active:scale-[0.995] transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
    accent && 'overflow-hidden',
    className
  );
  const inner = (
    <>
      {accent && (
        <div
          aria-hidden="true"
          className="absolute top-0 inset-x-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, transparent, ${safeAccent(accent)}, transparent)` }}
        />
      )}
      {children}
    </>
  );
  if (asChild && React.isValidElement(children)) {
    // Clone the single child (typically a <Link>) and merge our classes onto it
    // so focus / press feedback lands on the real interactive element.
    return React.cloneElement(children, {
      ref,
      className: cn(classes, children.props.className),
      style: { ...children.props.style, ...style },
      ...props,
    });
  }
  return (
    <div ref={ref} className={classes} style={style} {...props}>
      {inner}
    </div>
  );
});

const CardHeader = React.forwardRef(function CardHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
});

const CardTitle = React.forwardRef(function CardTitle({ className, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn('text-xl font-semibold leading-none tracking-tight text-white light:text-slate-900', className)}
      {...props}
    />
  );
});

const CardDescription = React.forwardRef(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-sm text-gray-400 light:text-slate-500', className)} {...props} />;
});

const CardContent = React.forwardRef(function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />;
});

const CardFooter = React.forwardRef(function CardFooter({ className, ...props }, ref) {
  return <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />;
});

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
export default Card;
