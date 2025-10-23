"use client";

import React from "react";

export type ProjectEnvironmentStatus = "ONLINE" | "DEGRADED" | "OFFLINE";

export interface ProjectEnvironmentSummary {
  id: string;
  name: string;
  branch: string;
  status: ProjectEnvironmentStatus;
  url?: string;
  lastDeployedAt?: string;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  repository: {
    name: string;
    url: string;
    defaultBranch: string;
  };
  activeBranch: string;
  vps: {
    ipAddress: string;
    status: ProjectEnvironmentStatus;
  };
  environments: ProjectEnvironmentSummary[];
}

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
