"use client";

import React from "react";
import Link from "next/link";
import { EnvBadge } from "./EnvBadge";
import { cn } from "@/lib/utils";
import { useProject } from "@/providers/studio/ProjectContext";
import type { ProjectEnvironmentStatus } from "@/providers/studio/ProjectContext";

export function getNewRunHref(): string {
  return "/specs/new";
}

export function getVpsStatusColor(status: ProjectEnvironmentStatus): string {
  switch (status) {
    case "ONLINE":
      return "bg-emerald-400";
    case "DEGRADED":
      return "bg-amber-400";
    default:
      return "bg-rose-400";
  }
}

export function Topbar({ className }: { className?: string }): React.ReactNode {
  const { project } = useProject();
  const repository = project?.repository;
  const statusColor = React.useMemo(
    () => getVpsStatusColor(project?.vps?.status ?? "OFFLINE"),
    [project?.vps?.status],
  );

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
          <span className={cn("h-2 w-2 rounded-full", statusColor)} aria-hidden />
          <span>{project?.name ?? "Loading project"}</span>
          <span className="hidden text-xs text-slate-400 md:inline">{project?.vps?.ipAddress ?? ""}</span>
        </button>
        <div className="hidden items-center gap-3 md:flex">
          <span className="rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs uppercase tracking-wide text-slate-400">
            {repository?.name ?? "Repo syncing"}
          </span>
          <span className="text-xs text-slate-500">Branch {project?.activeBranch ?? "..."}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <EnvBadge />
        <Link href={getNewRunHref()} className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20">
          New Run
        </Link>
      </div>
    </header>
  );
}
