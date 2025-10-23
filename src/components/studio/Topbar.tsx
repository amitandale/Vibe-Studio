"use client";

import React from "react";
import Link from "next/link";
import { EnvBadge } from "./EnvBadge";
import { cn } from "@/lib/utils";

export function Topbar({ className }: { className?: string }): React.ReactNode {
  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between border-b border-slate-800/60 bg-slate-950/70 px-6 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="group inline-flex items-center gap-2 rounded-md border border-slate-800/80 bg-slate-900/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
          <span>Local Project</span>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="h-4 w-4 text-slate-400 transition group-hover:text-slate-200"
          >
            <path d="M4.47 6.03a.75.75 0 0 1 1.06 0L8 8.47l2.47-2.44a.75.75 0 0 1 1.06 1.06l-3 2.97a.75.75 0 0 1-1.06 0l-3-2.97a.75.75 0 0 1 0-1.06Z" fill="currentColor" />
          </svg>
        </button>
        <div className="hidden items-center gap-3 md:flex">
          <span className="rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs uppercase tracking-wide text-slate-400">
            Trace
          </span>
          <span className="text-xs text-slate-500">Attach a trace ID to follow a run.</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <EnvBadge />
        <Link
          href="/specs/new"
          className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
        >
          New Run
        </Link>
      </div>
    </header>
  );
}
