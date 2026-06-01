import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

const variants = {
  default: 'bg-kaspa-green/15 text-kaspa-green border-kaspa-green/30',
  secondary: 'bg-white/10 text-gray-200 border-white/10',
  destructive: 'bg-red-500/15 text-red-400 border-red-500/30',
  outline: 'bg-transparent text-gray-200 border-white/10',
  tier: {
    BUILDER: 'bg-blue-500/15 text-blue-300 border-blue-500/40 shadow-[0_0_8px_rgba(59,130,246,0.2)]',
    PRO: 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]',
    MAX: 'bg-purple-500/15 text-purple-300 border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.2)]',
    FREE: 'bg-gray-500/15 text-gray-200 border-gray-500/30',
  },
};

const Badge = ({ className, variant = 'default', tier, children, ...props }) => {
  const tierVariant = tier && variants.tier[tier] ? variants.tier[tier] : null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full border',
        'uppercase tracking-wider whitespace-nowrap',
        tierVariant || variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

export { Badge };
