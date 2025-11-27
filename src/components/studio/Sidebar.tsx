"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { cn } from "@/lib/utils";
import { useProject } from "@/providers/studio/ProjectContext";

interface BaseNavItem {
  href: string;
  label: string;
  shortcut: string;
}

const NAV_ITEMS: BaseNavItem[] = [
  { href: "/", label: "Dashboard", shortcut: "g d" },
  { href: "/project", label: "Project", shortcut: "g p" },
  { href: "/specs", label: "Specs", shortcut: "g s" },
  { href: "/runs", label: "Runs", shortcut: "g r" },
  { href: "/artifacts", label: "Artifacts", shortcut: "g a" },
  { href: "/settings", label: "Settings", shortcut: "g ?" },
  { href: "/settings/system", label: "System Health", shortcut: "g h" },
];

export type NavItem = BaseNavItem;

export function getSidebarNavItems(): NavItem[] {
  return NAV_ITEMS;
}

export function Sidebar(): React.ReactNode {
  const pathname = usePathname() ?? "";
  const { project } = useProject();
  const name = project?.name ?? "Loading project";
  const items = React.useMemo(getSidebarNavItems, []);

  return (
    <aside className="hidden w-60 shrink-0 bg-slate-950/80 shadow-inner-right backdrop-blur md:flex md:flex-col">
      <div className="flex items-center gap-2 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500 text-slate-950 font-semibold">
          VS
        </div>
        <div>
          <p className="font-rajdhani text-lg font-semibold uppercase tracking-[0.18em] text-slate-100">Vibe-Studio</p>
          <p className="text-xs text-slate-400">{name}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition",
                isActive ? "bg-emerald-500/10 text-emerald-300" : "text-slate-300 hover:bg-slate-800/70 hover:text-white",
              )}
            >
              <span>{item.label}</span>
              <kbd className="rounded bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300 shadow">{item.shortcut}</kbd>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pb-6">
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-3 text-xs text-slate-400">
          <p className="font-medium text-slate-200">Keyboard</p>
          <p>Use the shortcuts to jump between studio sections.</p>
        </div>
      </div>
    </aside>
  );
}
