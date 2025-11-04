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
  content?: unknown;
}

export interface ToolDescription {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
  enabled: boolean;
}

export interface ProviderDescriptor {
  id: string;
  name: string;
  docsUrl?: string;
  regions?: string[];
}

export type ProviderTokenStatus = "valid" | "invalid" | "unknown";

export interface ProviderTokenRecord {
  id: string;
  providerId: string;
  label?: string;
  status: ProviderTokenStatus;
  createdAt: string;
  lastValidatedAt?: string;
  scopes?: string[];
}

export interface TokenValidationRequest {
  providerId: string;
  token: string;
  projectId?: string;
}

export interface TokenValidationResult {
  providerId: string;
  valid: boolean;
  expiresAt?: string;
  scopes?: string[];
  message?: string;
}

export interface StoreTokenRequest {
  providerId: string;
  token: string;
  label?: string;
  projectId?: string;
}

export interface BusinessLogicRecommendation {
  id: string;
  title: string;
  summary: string;
  estimatedEffort?: string;
  previewMarkdown?: string;
}

export interface UiTemplateRecommendation {
  id: string;
  name: string;
  summary: string;
  previewImageUrl?: string;
  accessibilityNotes?: string;
}

export type PullRequestStatus = "open" | "draft" | "merged" | "closed" | "error";

export interface PullRequestSummary {
  id: string;
  title: string;
  status: PullRequestStatus;
  createdAt: string;
  updatedAt: string;
  author?: string;
  branch?: string;
  metadata?: Record<string, unknown>;
}

export interface PullRequestDetail extends PullRequestSummary {
  description?: string;
  commits?: number;
  reviews?: number;
  lastRunId?: string;
}

export interface PullRequestMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
}
