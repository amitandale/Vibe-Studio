"use client";

import { AgentMcpClient, type TraceStreamOptions } from "./client";
import { onboardingEventSchema, onboardingManifestSchema, type OnboardingEvent, type OnboardingManifest } from "@/lib/onboarding/schemas";

export interface TraceStreamHandlers {
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

  streamTrace(traceId: string, handlers: TraceStreamHandlers): () => void {
    const options: TraceStreamOptions<unknown> = {
      onEvent: (payload) => {
        try {
          const parsed = onboardingEventSchema.parse(payload);
          handlers.onEvent(parsed);
        } catch (error) {
          handlers.onError?.(error);
        }
      },
      onError: handlers.onError,
      onOpen: handlers.onOpen,
      retryDelays: [500, 1500, 3000],
      projectId: this.projectId,
    };
    return this.client.streamTrace(traceId, options);
  }
}
