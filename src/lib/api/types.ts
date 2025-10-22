export interface RunCreateRequest {
  spec: RunSpec;
  metadata?: Record<string, unknown>;
  input?: Record<string, unknown>;
}

export interface RunSpec {
  name: string;
  version?: string;
  summary?: string;
  instructions: string;
  plan?: string[];
  entrypoint?: {
    kind: "plan" | "patch" | "artifact" | "log";
    description?: string;
  };
  config?: Record<string, unknown>;
  tools?: string[];
  [key: string]: unknown;
}

export interface Run {
  id: string;
  status: RunStatus;
  created_at: string;
  updated_at: string;
  spec: RunSpec;
  metadata?: Record<string, unknown>;
  input?: Record<string, unknown>;
}

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "unknown";

export interface RunStreamEvent {
  id: string;
  run_id: string;
  sequence: number;
  type: "plan" | "patch" | "log" | "artifact" | "status" | "error" | string;
  payload: unknown;
  created_at: string;
}

export interface Artifact {
  id: string;
  filename: string;
  mime_type: string;
  size?: number;
  created_at: string;
  updated_at: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolDescription {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
  enabled: boolean;
}
