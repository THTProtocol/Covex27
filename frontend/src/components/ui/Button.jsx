import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

const variants = {
  default: 'bg-kaspa-green text-black hover:bg-[#3cd8b6] shadow-[0_0_15px_rgba(73,234,203,0.3)] hover:shadow-[0_0_25px_rgba(73,234,203,0.6)]',
  destructive: 'bg-red-600 text-white hover:bg-red-700 shadow-[0_0_15px_rgba(239,68,68,0.3)]',
  outline: 'border border-zinc-700/80 bg-transparent text-white hover:border-kaspa-green/60 hover:bg-kaspa-green/[0.04]',
  secondary: 'bg-white/10 text-white hover:bg-white/15 border border-white/10',
  ghost: 'text-gray-200 hover:text-white hover:bg-white/5',
  link: 'text-kaspa-green underline-offset-4 hover:underline',
};

const sizes = {
  default: 'h-10 px-5 py-2',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-12 px-8 text-base',
  icon: 'h-10 w-10',
};

const Button = forwardRef(({ className, variant = 'default', size = 'default', children, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-bold text-sm',
        'transition-all duration-200 active:scale-95',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kaspa-green/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05050A]',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
Button.displayName = 'Button';

export { Button };
