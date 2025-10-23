import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { isFeatureEnabled } from "@/lib/flags";

export default function DashboardPage(): React.ReactNode {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-8 shadow-lg shadow-emerald-500/5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-rajdhani text-sm uppercase tracking-[0.35em] text-slate-400">Studio Overview</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Welcome to Vibe-Studio</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Compose MCP specs, launch runs, and inspect artifacts without leaving the orchestration console. This dashboard
              surfaces your latest runs, saved specs, and workspace health.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/specs/new"
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
            >
              New Spec
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/runs"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-900/60 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
            >
              View Runs
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-6">
          <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-500">Runs</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Recent Execution</h2>
          <p className="mt-2 text-sm text-slate-400">Run your specs to generate traces, logs, and artifacts streamed in real time.</p>
          <div className="mt-4 rounded-lg border border-slate-900/80 bg-slate-900/60 p-4 text-sm text-slate-300">
            No runs yet. Kick off your first spec to populate this feed.
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-6">
          <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-500">Specs</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Spec Drafts</h2>
          <p className="mt-2 text-sm text-slate-400">Capture agent intent and orchestration metadata in a reproducible manifest.</p>
          <div className="mt-4 rounded-lg border border-slate-900/80 bg-slate-900/60 p-4 text-sm text-slate-300">
            Draft specs appear here once saved. Use the builder to create the request body for new runs.
          </div>
        </div>
      </section>

      {isFeatureEnabled("studio.streamingPanes") ? (
        <section className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-6">
          <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-500">Streaming</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Live Output</h2>
          <p className="mt-2 text-sm text-slate-400">Connect a run to stream plans, patches, logs, and artifacts into dedicated panes.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {["Plan", "Patch Loop", "Logs", "Artifacts"].map((pane) => (
              <div key={pane} className="rounded-lg border border-slate-900/70 bg-slate-900/50 p-4 text-sm text-slate-300">
                <p className="font-semibold text-slate-200">{pane}</p>
                <p className="mt-2 text-xs text-slate-400">Streaming pane placeholder. Events will render in PR-02.</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
