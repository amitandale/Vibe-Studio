"use client";

import React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { EnvBadge } from "./EnvBadge";
import { getSidebarNavItems } from "./Sidebar";
import { cn } from "@/lib/utils";
import { readTraceId, getProjectKey } from "@/lib/onboarding/storage";
import { useProject } from "@/providers/studio/ProjectContext";
import { useStudioEnvironment } from "@/providers/studio/StudioProvider";
import type { ProjectEnvironmentStatus } from "@/types/project";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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
  const { snapshot: environment } = useStudioEnvironment();
  const [traceId, setTraceId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_PROJECT_ID?.trim();
    if (!projectId) {
      return;
    }
    const storageKey = getProjectKey(projectId, "trace");
    const update = () => {
      setTraceId(readTraceId(projectId));
    };
    update();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        update();
      }
    };
    const handleFocus = () => update();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return (
    <header
      className={cn(
        "w-full border-b border-slate-800/70 bg-slate-950/80 px-4 py-4 text-sm backdrop-blur md:px-6",
        className,
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <MobileNav
              projectName={project?.name ?? "Vibe-Studio"}
              projectSubtitle={project?.vps?.ipAddress ?? project?.repository?.name ?? null}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 sm:px-4">
              <div className="flex items-center gap-2 text-slate-200">
                <span className={cn("h-2 w-2 rounded-full", statusColor)} aria-hidden />
                <p className="truncate text-base font-semibold">
                  {project?.name ?? "Loading project"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="rounded-full border border-slate-800/70 bg-slate-950/50 px-2 py-1 uppercase tracking-wide">
                  {repository?.name ?? "Repo syncing"}
                </span>
                <span className="whitespace-nowrap">Branch {project?.activeBranch ?? "..."}</span>
                {project?.vps?.ipAddress ? (
                  <span className="whitespace-nowrap text-slate-500">{project.vps.ipAddress}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <div className="flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
            <span className="font-semibold text-slate-100">Trace</span>
            <span className="truncate">{traceId ?? "not set"}</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs capitalize text-slate-300 md:hidden">
            <span className={cn("h-2 w-2 rounded-full", getEnvironmentStatusColor(environment.status))} aria-hidden />
            <span>{environment.status.toLowerCase()}</span>
            {environment.latencyMs ? <span className="text-[10px] text-slate-400">• {environment.latencyMs} ms</span> : null}
          </div>
          <div className="md:hidden">
            <EnvBadge />
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
              <span className={cn("h-2 w-2 rounded-full", getEnvironmentStatusColor(environment.status))} aria-hidden />
              {environment.status.toLowerCase()}
              {environment.latencyMs ? <span className="text-[10px] text-slate-400">• {environment.latencyMs} ms</span> : null}
            </span>
            <EnvBadge />
          </div>
          <Link
            href={getNewRunHref()}
            className="inline-flex flex-1 items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 sm:flex-initial"
          >
            New Run
          </Link>
        </div>
      </div>
    </header>
  );
}

function getEnvironmentStatusColor(status: "ONLINE" | "DEGRADED" | "OFFLINE"): string {
  switch (status) {
    case "ONLINE":
      return "bg-emerald-400";
    case "DEGRADED":
      return "bg-amber-400";
    default:
      return "bg-rose-400";
  }
}

interface MobileNavProps {
  projectName: string;
  projectSubtitle: string | null;
}

function MobileNav({ projectName, projectSubtitle }: MobileNavProps): React.ReactNode {
  const pathname = usePathname() ?? "";
  const items = React.useMemo(getSidebarNavItems, []);

  return (
    <Sheet>
      <SheetTrigger className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-800/80 bg-slate-900/60 text-slate-200 transition hover:border-slate-700 hover:bg-slate-800 md:hidden">
        <Menu className="h-5 w-5" aria-hidden />
        <span className="sr-only">Open navigation</span>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="gap-0 border-r border-slate-800/80 bg-slate-950/95 px-0 pb-6 pt-0 text-slate-100"
      >
        <div className="flex items-center gap-3 border-b border-slate-800/80 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500 text-slate-950 font-semibold">
            VS
          </div>
          <div>
            <p className="font-rajdhani text-base font-semibold uppercase tracking-[0.18em] text-slate-100">
              Vibe-Studio
            </p>
            <p className="text-xs text-slate-400">{projectSubtitle ?? projectName}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            return (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-white",
                  )}
                >
                  <span>{item.label}</span>
                  <kbd className="rounded bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300 shadow">
                    {item.shortcut}
                  </kbd>
                </Link>
              </SheetClose>
            );
          })}
        </nav>
        <div className="border-t border-slate-800/80 px-5 py-4 text-xs text-slate-400">
          Use the shortcuts to jump between studio sections.
        </div>
      </SheetContent>
    </Sheet>
  );
}
