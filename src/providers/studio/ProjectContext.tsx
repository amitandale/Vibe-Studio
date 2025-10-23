"use client";

import React from "react";
import type { ProjectMetadata } from "@/types/project";

export type ProjectContextError = Error | null;

export interface ProjectContextValue {
  project: ProjectMetadata | null;
  isLoading: boolean;
  error: ProjectContextError;
  refresh: () => Promise<void>;
}

const ProjectContext = React.createContext<ProjectContextValue | undefined>(undefined);

export function ProjectContextProvider({
  value,
  children,
}: {
  value: ProjectContextValue;
  children: React.ReactNode;
}): React.ReactElement {
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const context = React.useContext(ProjectContext);

  if (!context) {
    throw new Error("useProject must be used within a ProjectContextProvider");
  }

  return context;
}
