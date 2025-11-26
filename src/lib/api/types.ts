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
  summary?: string;
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

export interface ToolAttachmentPayload {
  name: string;
  data: string;
  mime_type: string;
  metadata?: Record<string, unknown>;
}

export interface ToolInvocationRequest<TInput = unknown> {
  input?: TInput;
  projectId?: string;
  traceId?: string;
  attachments?: ToolAttachmentPayload[];
  metadata?: Record<string, unknown>;
}

export interface ToolInvocationResponse<TResult = unknown> {
  tool: string;
  result: TResult;
  rationale?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
  artifacts?: Artifact[];
  events?: RunStreamEvent[];
}

export interface ToolInvocationErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface WorkflowInvocationRequest<TInput = unknown> {
  workflowId: string;
  input: TInput;
  projectId?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowInvocationResponse<TOutput = unknown> {
  workflowId: string;
  runId: string;
  output?: TOutput;
  status: RunStatus;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export type VendorType = "codex" | "claude" | "grok" | "antigravity" | "kimi" | "qwen";

export interface PRImplementationRequest {
  pr_title: string;
  pr_text: string;
  repo_url: string;
  working_branch: string;
  vendor: VendorType;
}

export interface PRImplementationOutput {
  checkout: {
    workspace_path: string;
    branch: string;
    checkout_log: string[];
  };
  implementation: {
    vendor: VendorType;
    instruction: string;
    streamed_output: string[];
    exit_code?: number;
    success: boolean;
    files_changed: string[];
    created: string[];
    deleted: string[];
    diff_preview?: string;
  };
  commit: {
    branch_name: string;
    commit_message: string;
    commit_sha?: string;
    pushed: boolean;
  };
  pull_request: {
    pr_number?: number;
    pr_url?: string;
    draft: boolean;
  };
  ci_status: {
    status: string;
    logs: string[];
    errors: string[];
  };
  diff: {
    files: Record<string, { added: number; deleted: number }>;
    full_diff?: string;
  };
  fix_attempts: string[];
  success: boolean;
}
