import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

const Input = forwardRef(({ className, type = 'text', ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-xl px-4 py-2 text-sm',
        'bg-black/40 border border-kaspa-green/20',
        'text-kaspa-green placeholder:text-kaspa-green/20',
        'transition-all duration-300',
        'focus:outline-none focus:border-kaspa-green focus:shadow-[0_0_15px_rgba(73,234,203,0.2),inset_0_0_8px_rgba(73,234,203,0.04)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
