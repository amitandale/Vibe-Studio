import React from "react";
import Link from "next/link";

export default function SpecsPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Specs</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Specs</h1>
        <p className="mt-2 text-sm text-slate-400">
          Capture agent manifests as structured specs. Use the builder to compose the payload sent to agent-mcp when creating a
          run.
        </p>
        <Link
          href="/specs/new"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
        >
          Create a spec
        </Link>
      </header>
      <section className="rounded-xl border border-dashed border-slate-800/60 bg-slate-950/40 p-6 text-sm text-slate-400">
        Spec persistence lands in a later milestone. Drafts live in memory for now.
      </section>
    </div>
  );
}
