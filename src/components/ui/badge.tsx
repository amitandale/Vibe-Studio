import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
  {
    variants: {
      variant: {
        default: "border-slate-700 bg-slate-900/80 text-slate-100",
        secondary: "border-slate-800 bg-slate-950/60 text-slate-300",
        destructive: "border-rose-500/40 bg-rose-500/10 text-rose-200",
        outline: "border-slate-700 text-slate-200",
        success: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
