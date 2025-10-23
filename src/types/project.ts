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
