import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-white/[0.06] bg-oklch(0.55_0.18_150_/_15%) backdrop-blur-sm text-white hover:bg-oklch(0.55_0.18_150_/_25%) shadow-[0_0_0_1px_rgba(255,255,255,0.05)]",
        secondary:
          "border-white/[0.08] bg-white/[0.06] backdrop-blur-sm text-white hover:bg-white/[0.12]",
        destructive:
          "border-transparent bg-red-500/80 text-white hover:bg-red-500",
        outline: "text-white border-white/30",
        max: "border-purple-500/40 bg-purple-500/[0.10] backdrop-blur-sm text-purple-300 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]",
        pro: "border-amber-500/40 bg-amber-500/[0.10] backdrop-blur-sm text-amber-300 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]",
        builder: "border-[#49EACB]/40 bg-[#49EACB]/[0.10] backdrop-blur-sm text-[#49EACB] shadow-[0_0_0_1px_rgba(255,255,255,0.05)]",
        success: "border-[oklch(0.65_0.18_145_/_25%)] bg-[oklch(0.65_0.18_145_/_12%)] text-[oklch(0.75_0.18_145)] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        warning: "border-[oklch(0.78_0.18_80_/_25%)] bg-[oklch(0.78_0.18_80_/_12%)] text-[oklch(0.85_0.18_80)] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        error: "border-[oklch(0.6_0.22_25_/_25%)] bg-[oklch(0.6_0.22_25_/_12%)] text-[oklch(0.72_0.2_25)] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
