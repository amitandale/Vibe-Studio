import { AgentMcpClient } from "@/lib/api/client";
import type {
  PRImplementationRequest,
  PRImplementationOutput,
  WorkflowInvocationResponse,
  RunStreamEvent,
} from "@/lib/api/types";

export interface WorkflowProgress {
  action: string;
  message: string;
  timestamp: string;
}

export interface WorkflowStreamCallbacks {
  onProgress?: (progress: WorkflowProgress) => void;
  onEvent?: (event: RunStreamEvent) => void;
  onComplete?: (output?: PRImplementationOutput) => void;
  onError?: (error: Error) => void;
}

export class ImplementationWorkflowService {
  constructor(private client: AgentMcpClient) {}

  async invoke(
    request: PRImplementationRequest,
    options?: {
      projectId?: string;
      traceId?: string;
      signal?: AbortSignal;
    },
  ): Promise<WorkflowInvocationResponse<PRImplementationOutput>> {
    return this.client.invokePRImplementationWorkflow(
      request,
      {
        projectId: options?.projectId,
        traceId: options?.traceId,
      },
      {
        signal: options?.signal,
      },
    );
  }

  async invokeAndStream(
    request: PRImplementationRequest,
    callbacks: WorkflowStreamCallbacks,
    options?: {
      projectId?: string;
      traceId?: string;
      signal?: AbortSignal;
    },
  ): Promise<() => void> {
    const response = await this.invoke(request, options);

    const teardown = this.client.streamWorkflow(
      "implementation_workflow_v1",
      response.runId,
      {
        projectId: options?.projectId,
        traceId: options?.traceId,
        signal: options?.signal,
        onEvent: (event) => {
          callbacks.onEvent?.(event);

          if (event.type === "log" && typeof event.payload === "object" && event.payload) {
            const payload = event.payload as Record<string, unknown>;
            const progressAction = payload.progress_action as string | undefined;
            const message = payload.message as string | undefined;

            if (progressAction && message) {
              callbacks.onProgress?.({
                action: progressAction,
                message,
                timestamp: event.created_at,
              });
            }
          }

          if (event.type === "status") {
            if (event.payload === "succeeded") {
              callbacks.onComplete?.(response.output);
            } else if (event.payload === "failed") {
              callbacks.onError?.(new Error("Workflow failed"));
            }
          }
        },
        onError: (error) => {
          callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
        },
      },
    );

    return teardown;
  }
}
