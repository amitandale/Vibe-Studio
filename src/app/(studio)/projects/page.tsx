import React from "react";
import Link from "next/link";

export default function ProjectsPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Projects</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Projects</h1>
        <p className="mt-2 text-sm text-slate-400">
          Projects group related specs, runs, and artifacts. Scaffolding only—import repositories and runtime configs in
          upcoming releases.
        </p>
        <Link
          href="/specs/new"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
        >
          Draft a spec
        </Link>
      </header>
      <section className="rounded-xl border border-dashed border-slate-800/60 bg-slate-950/40 p-6 text-sm text-slate-400">
        No projects yet. Connect your workspace when server-side sync is available.
      </section>
    </div>
  );
}
