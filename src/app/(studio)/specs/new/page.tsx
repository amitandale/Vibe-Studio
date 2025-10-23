import React from "react";
import { SpecBuilder } from "@/components/specs/SpecBuilder";
import { isFeatureEnabled } from "@/lib/flags";

export default function SpecBuilderPage(): React.ReactNode {
  if (!isFeatureEnabled("studio.specBuilder")) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6 text-sm text-slate-300">
        The spec builder is disabled by feature flag.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Spec Builder</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Compose a Spec</h1>
        <p className="mt-2 text-sm text-slate-400">
          Fill out the manifest fields to generate the request body used when calling <code className="text-emerald-300">POST /v1/runs</code> on agent-mcp.
        </p>
      </header>
      <SpecBuilder />
    </div>
  );
}
