import React from "react";
import { cn } from "@/lib/utils";

interface SpecJsonPreviewProps {
  value: unknown;
  className?: string;
}

export function SpecJsonPreview({ value, className }: SpecJsonPreviewProps): React.ReactNode {
  const formatted = React.useMemo(() => JSON.stringify(value, null, 2), [value]);
  return (
    <pre
      aria-label="Spec JSON Preview"
      className={cn(
        "h-full min-h-[240px] w-full overflow-x-auto rounded-lg border border-slate-800/70 bg-slate-950/70 p-4 text-xs leading-relaxed text-emerald-100",
        className,
      )}
    >
      {formatted}
    </pre>
  );
}
