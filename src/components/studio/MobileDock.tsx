"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitBranch,
  FileText,
  PlayCircle,
  Package,
  Settings,
} from "lucide-react";
import { getSidebarNavItems } from "./Sidebar";
import { cn } from "@/lib/utils";

type IconMap = Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>;

const ICONS: IconMap = {
  "/": LayoutDashboard,
  "/project": GitBranch,
  "/specs": FileText,
  "/runs": PlayCircle,
  "/artifacts": Package,
  "/settings": Settings,
};

export function MobileDock(): React.ReactNode {
  const pathname = usePathname() ?? "/";
  const items = React.useMemo(() => getSidebarNavItems(), []);

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center md:hidden">
      <div className="pointer-events-auto inline-flex w-[min(100%-2rem,420px)] items-center justify-between gap-1 rounded-2xl border border-slate-800/80 bg-slate-950/80 px-3 py-2 shadow-lg shadow-emerald-500/10 backdrop-blur-lg">
        {items.map((item) => {
          const Icon = ICONS[item.href] ?? LayoutDashboard;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex h-12 w-12 flex-col items-center justify-center rounded-xl text-[10px] font-semibold uppercase tracking-wide transition",
                isActive
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="mt-1">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
