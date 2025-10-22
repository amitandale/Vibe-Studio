import React from "react";

export default function ArtifactsPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Artifacts</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Artifacts</h1>
        <p className="mt-2 text-sm text-slate-400">
          Download build outputs, patches, and context bundles emitted during MCP runs. Integration with <code className="text-emerald-300">GET /v1/artifacts/&lt;id&gt;</code> arrives alongside PR-02 wiring.
        </p>
      </header>
      <section className="rounded-xl border border-dashed border-slate-800/60 bg-slate-950/40 p-6 text-sm text-slate-400">
        Artifacts will populate once runs begin producing them. Configure agent outputs in later milestones.
      </section>
    </div>
  );
}
