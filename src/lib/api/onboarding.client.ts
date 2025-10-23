"use client";

import { AgentMcpClient } from "./client";
import { onboardingEventSchema, onboardingManifestSchema, type OnboardingEvent, type OnboardingManifest } from "@/lib/onboarding/schemas";

export interface StartRunRequest {
  task: string;
  inputs?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

export interface StartRunResponse {
  id: string;
  status?: string;
  created_at?: string;
}

export interface StreamHandlers {
  onEvent: (event: OnboardingEvent) => void;
  onError?: (error: unknown) => void;
  onOpen?: () => void;
}

export class OnboardingClient {
  private readonly client: AgentMcpClient;
  private readonly projectId: string;

  constructor(baseUrl: string, projectId: string) {
    this.client = new AgentMcpClient(baseUrl);
    this.projectId = projectId;
  }

  get baseUrl(): string {
    return this.client.getBaseUrl();
  }

  async fetchManifest(traceId?: string): Promise<OnboardingManifest | null> {
    try {
      const artifact = await this.client.fetchArtifact("onboarding/manifest.json", {
        method: "GET",
        query: { project_id: this.projectId },
        traceId,
        retryDelays: [300, 600, 1200],
      });
      const raw =
        (typeof artifact.content === "string" ? JSON.parse(artifact.content) : artifact.content) ??
        (artifact.metadata?.content as unknown | undefined) ??
        null;
      if (!raw) {
        throw new Error("Manifest artifact missing content");
      }
      return onboardingManifestSchema.parse(raw);
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  async startRun(body: StartRunRequest, traceId?: string): Promise<StartRunResponse> {
    const response = await fetch(`${this.baseUrl}/v1/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(traceId ? { "x-trace-id": traceId } : {}),
      },
      body: JSON.stringify({
        ...body,
        project_id: this.projectId,
        trace_id: traceId,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to start onboarding run (${response.status}): ${text}`);
    }
    const payload = (await response.json()) as StartRunResponse;
    if (!payload?.id) {
      throw new Error("Run response missing identifier");
    }
    return payload;
  }

  streamRun(runId: string, handlers: StreamHandlers, traceId?: string): () => void {
    return this.client.streamRun(runId, {
      onEvent: (raw) => {
        try {
          const payload = (raw.payload ?? raw) as unknown;
          const parsed = onboardingEventSchema.parse(payload);
          handlers.onEvent(parsed);
        } catch (error) {
          handlers.onError?.(error);
        }
      },
      onError: handlers.onError,
      onOpen: handlers.onOpen,
      retryDelays: [500, 1500, 3000],
      traceId,
      projectId: this.projectId,
    });
  }
}
