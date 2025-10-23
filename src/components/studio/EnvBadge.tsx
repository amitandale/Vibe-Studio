"use client";

import React from "react";
import { useStudioEnvironment } from "@/providers/studio/StudioProvider";
import { isFeatureEnabled } from "@/lib/flags";

const STATUS_COLORS: Record<string, string> = {
  ONLINE: "bg-emerald-500/10 text-emerald-300 border-emerald-400/40",
  DEGRADED: "bg-amber-500/10 text-amber-300 border-amber-400/40",
  OFFLINE: "bg-rose-500/10 text-rose-300 border-rose-400/40",
};

export function EnvBadge(): React.ReactNode {
  const { snapshot } = useStudioEnvironment();

  if (!isFeatureEnabled("studio.envDetection")) {
    return null;
  }

  const color = STATUS_COLORS[snapshot.status] ?? STATUS_COLORS.OFFLINE;
  const description = snapshot.reason ? `— ${snapshot.reason}` : "";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${color}`}
    >
      <span className="inline-flex h-2 w-2 rounded-full bg-current" aria-hidden />
      <span>{snapshot.status}</span>
      {snapshot.latencyMs !== undefined && (
        <span className="text-[10px] text-slate-300/70">{snapshot.latencyMs.toFixed(0)} ms</span>
      )}
      {description && <span className="text-[10px] text-slate-400">{description}</span>}
    </div>
  );
}
