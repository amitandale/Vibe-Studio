import React from "react";
import Link from "next/link";

export default function ProjectOverviewPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Project</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Project Overview</h1>
        <p className="mt-2 text-sm text-slate-400">
          This Vibe-Studio instance manages the full lifecycle for your dedicated project VPS. Link environments, orchestrate
          specs, and review artifacts without leaving the project scope.
        </p>
        <Link
          href="/specs/new"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
        >
          Draft a spec
        </Link>
      </header>
      <section className="rounded-xl border border-dashed border-slate-800/60 bg-slate-950/40 p-6 text-sm text-slate-400">
        Project metadata syncing is coming soon. In the meantime, use the navigation to explore specs, runs, and artifacts.
      </section>
    </div>
  );
}
