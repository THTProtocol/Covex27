import { cn } from '../../lib/utils';

const Separator = ({ className, orientation = 'horizontal', decorative = true, ...props }) => (
  <div
    role={decorative ? 'none' : 'separator'}
    aria-orientation={decorative ? undefined : orientation}
    className={cn(
      'shrink-0 border-none',
      orientation === 'horizontal'
        ? 'h-[1px] w-full bg-gradient-to-r from-transparent via-white/[0.10] to-transparent'
        : 'w-[1px] h-full bg-gradient-to-b from-transparent via-white/[0.10] to-transparent',
      className
    )}
    {...props}
  />
);

export { Separator };
