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

const Card = React.forwardRef(function Card(
  { className, hover = false, hero = false, accent, children, style, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative rounded-2xl border border-white/10 bg-zinc-900/80 text-white shadow-sm backdrop-blur-sm',
        'light:bg-white light:border-slate-200 light:text-slate-900 light:shadow-sm',
        hover && 'hover-lift',
        hero && 'detail-hero-enhanced',
        accent && 'overflow-hidden',
        className
      )}
      style={style}
      {...props}
    >
      {accent && (
        <div
          aria-hidden="true"
          className="absolute top-0 inset-x-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, transparent, ${safeAccent(accent)}, transparent)` }}
        />
      )}
      {children}
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
