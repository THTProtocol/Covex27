import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

const Card = forwardRef(({ className, variant = 'default', children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border transition-all duration-300',
        {
          default: 'border-white/5 bg-white/[0.02] backdrop-blur-xl',
          glass: 'glass-panel',
          heavy: 'glass-panel-heavy',
          highlighted: 'border-kaspa-green/20 bg-kaspa-green/[0.03]',
          interactive: 'border-white/5 bg-white/[0.02] backdrop-blur-xl hover:border-kaspa-green/30 hover:bg-kaspa-green/[0.03] cursor-pointer',
        }[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
Card.displayName = 'Card';

const CardHeader = ({ className, children, ...props }) => (
  <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props}>
    {children}
  </div>
);

const CardTitle = ({ className, ...props }) => (
  <h3 className={cn('font-bold text-lg text-white tracking-tight', className)} {...props} />
);

const CardDescription = ({ className, ...props }) => (
  <p className={cn('text-sm text-gray-200', className)} {...props} />
);

const CardContent = ({ className, ...props }) => (
  <div className={cn('p-6 pt-0', className)} {...props} />
);

const CardFooter = ({ className, ...props }) => (
  <div className={cn('flex items-center p-6 pt-0', className)} {...props} />
);

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
