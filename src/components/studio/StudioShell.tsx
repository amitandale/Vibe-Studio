"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { StudioProvider } from "@/providers/studio/StudioProvider";

export function StudioShell({ children }: { children: React.ReactNode }): React.ReactNode {
  const router = useRouter();

  React.useEffect(() => {
    let awaitingSecondKey = false;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    const reset = () => {
      awaitingSecondKey = false;
      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = undefined;
      }
    };

    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (event.key.toLowerCase() === "g") {
        awaitingSecondKey = true;
        if (resetTimer) {
          clearTimeout(resetTimer);
        }
        resetTimer = setTimeout(reset, 1500);
        event.preventDefault();
        return;
      }

      if (awaitingSecondKey) {
        const key = event.key.toLowerCase();
        switch (key) {
          case "p":
            router.push("/projects");
            break;
          case "s":
            router.push("/specs");
            break;
          case "r":
            router.push("/runs");
            break;
          case "a":
            router.push("/artifacts");
            break;
          case "d":
            router.push("/");
            break;
          case "?":
            router.push("/settings");
            break;
          default:
            break;
        }
        event.preventDefault();
        reset();
      } else if (event.key === "?") {
        console.info("Shortcuts: g d (Dashboard), g p (Projects), g s (Specs), g r (Runs), g a (Artifacts)");
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (resetTimer) {
        clearTimeout(resetTimer);
      }
    };
  }, [router]);

  return (
    <StudioProvider>
      <a
        href="#studio-main"
        className="absolute left-1/2 top-2 z-50 -translate-x-1/2 -translate-y-20 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white opacity-0 shadow transition focus:translate-y-0 focus:opacity-100 focus:outline-none focus-visible:ring"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar />
          <main
            id="studio-main"
            className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-950/80 to-slate-900 px-4 py-6 md:px-10"
          >
            <div className="mx-auto w-full max-w-5xl space-y-8">{children}</div>
          </main>
        </div>
      </div>
    </StudioProvider>
  );
}
