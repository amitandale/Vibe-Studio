"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileDock } from "./MobileDock";
import { ProjectContextProvider, type ProjectContextError } from "@/providers/studio/ProjectContext";
import type { ProjectMetadata } from "@/types/project";
import { StudioProvider } from "@/providers/studio/StudioProvider";

interface StudioShellProps {
  children: React.ReactNode;
}

type ProjectState = {
  project: ProjectMetadata | null;
  isLoading: boolean;
  error: ProjectContextError;
};

const INITIAL_STATE: ProjectState = {
  project: null,
  isLoading: true,
  error: null,
};

export function StudioShell({ children }: StudioShellProps): React.ReactNode {
  const router = useRouter();
  const mountedRef = React.useRef(true);
  const [state, setState] = React.useState<ProjectState>(INITIAL_STATE);

  const hydrate = React.useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const metadata = await fetchProjectMetadata();
      if (!mountedRef.current) {
        return;
      }
      setState({ project: metadata, isLoading: false, error: null });
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      setState({
        project: null,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Unable to load project metadata"),
      });
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    void hydrate();
    return () => {
      mountedRef.current = false;
    };
  }, [hydrate]);

  const refresh = React.useCallback(async () => {
    await hydrate();
  }, [hydrate]);

  const contextValue = React.useMemo(
    () => ({
      project: state.project,
      isLoading: state.isLoading,
      error: state.error,
      refresh,
    }),
    [state.project, state.isLoading, state.error, refresh],
  );

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
            router.push("/project");
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
          case "h":
            router.push("/settings/system");
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
        console.info(
          "Shortcuts: g d (Dashboard), g p (Project Overview), g s (Specs), g r (Runs), g a (Artifacts)",
        );
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
    <ProjectContextProvider value={contextValue}>
      <StudioProvider>
        <a
          href="#studio-main"
          className="absolute left-1/2 top-2 z-50 -translate-x-1/2 -translate-y-20 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white opacity-0 shadow transition focus:translate-y-0 focus:opacity-100 focus:outline-none focus-visible:ring"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen bg-slate-950 text-slate-100">
          <Sidebar />
          <div className="relative flex flex-1 flex-col">
            <Topbar className="sticky top-0 z-40" />
            <main
              id="studio-main"
              className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-950/85 to-slate-900 px-4 pb-28 pt-6 md:px-10 md:pb-12"
            >
              <div className="mx-auto w-full max-w-5xl space-y-8">{children}</div>
            </main>
          </div>
        </div>
        <MobileDock />
      </StudioProvider>
    </ProjectContextProvider>
  );
}

type ProjectMetadataResponse = {
  project?: ProjectMetadata;
};

async function fetchProjectMetadata(): Promise<ProjectMetadata> {
  const response = await fetch("/api/project", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch project metadata (${response.status})`);
  }

  const payload = (await response.json()) as ProjectMetadataResponse;
  if (!payload.project) {
    throw new Error("Project metadata unavailable");
  }

  return payload.project;
}
