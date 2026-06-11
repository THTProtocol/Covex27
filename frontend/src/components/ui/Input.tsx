import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-[8px] px-4 py-3 text-sm text-white placeholder:text-white/[0.28] transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_2px_8px_rgba(0,0,0,0.1)] focus-visible:outline-none focus-visible:border-[var(--accent-primary)] focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_3px_oklch(0.65_0.20_150_/_15%)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
