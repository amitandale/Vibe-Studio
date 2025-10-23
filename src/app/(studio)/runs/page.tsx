import React from "react";
import Link from "next/link";

export default function RunsPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Runs</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Runs</h1>
        <p className="mt-2 text-sm text-slate-400">
          Monitor MCP runs triggered from specs. Stream plans, patches, logs, and artifacts for every execution.
        </p>
        <Link
          href="/specs/new"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
        >
          Launch from spec
        </Link>
      </header>
      <section className="rounded-xl border border-dashed border-slate-800/60 bg-slate-950/40 p-6 text-sm text-slate-400">
        No runs to display. Create one from the spec builder.
      </section>
    </div>
  );
}
