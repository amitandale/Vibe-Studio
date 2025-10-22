import React from "react";
import { useStudioEnvironment } from "@/providers/studio/StudioProvider";

export default function SettingsPage(): React.ReactNode {
  const { snapshot, refresh } = useStudioEnvironment();

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Settings</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-2 text-sm text-slate-400">
          Environment detection prefers <code className="text-emerald-300">NEXT_PUBLIC_MCP_BASE_URL</code>. When unset, the UI probes
          the current origin&apos;s <code className="text-emerald-300">/health</code> endpoint with a 2s timeout.
        </p>
      </header>
      <section className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <h2 className="text-lg font-semibold text-white">agent-mcp Connectivity</h2>
        <dl className="mt-4 grid gap-3 text-sm text-slate-300">
          <div>
            <dt className="uppercase tracking-wide text-slate-500">Status</dt>
            <dd className="mt-1 text-emerald-200">{snapshot.status}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-slate-500">Base URL</dt>
            <dd className="mt-1 font-mono text-xs text-slate-200">{snapshot.baseUrl ?? "Not detected"}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-slate-500">Latency</dt>
            <dd className="mt-1 text-slate-200">{snapshot.latencyMs ? `${snapshot.latencyMs.toFixed(0)} ms` : "Unknown"}</dd>
          </div>
          {snapshot.reason && (
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Diagnostics</dt>
              <dd className="mt-1 text-slate-200">{snapshot.reason}</dd>
            </div>
          )}
        </dl>
        <button
          type="button"
          onClick={() => refresh()}
          className="mt-6 rounded-lg border border-slate-800/80 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-slate-900/80"
        >
          Retry detection
        </button>
      </section>
    </div>
  );
}
