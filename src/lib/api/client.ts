"use client";

import { Run, RunCreateRequest, RunStreamEvent, ToolDescription, Artifact } from "./types";

type FetchInit = RequestInit & { retryDelays?: number[]; traceId?: string; query?: Record<string, string> };

export interface StreamOptions {
  signal?: AbortSignal;
  lastEventId?: string;
  retryDelays?: number[];
  onEvent: (event: RunStreamEvent) => void;
  onError?: (error: unknown) => void;
  onOpen?: () => void;
  traceId?: string;
  projectId?: string;
}

export class AgentMcpClient {
  constructor(private readonly baseUrl: string) {}

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async createRun(body: RunCreateRequest, init?: FetchInit): Promise<Run> {
    return this.request<Run>("/v1/runs", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
      ...init,
    });
  }

  async cancelRun(runId: string, init?: FetchInit): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/v1/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      ...init,
    });
  }

  async fetchArtifact(artifactId: string, init?: FetchInit): Promise<Artifact> {
    const query = init?.query ? new URLSearchParams(init.query).toString() : "";
    const path = `/v1/artifacts/${encodeURIComponent(artifactId)}${query ? `?${query}` : ""}`;
    const { query: _ignored, ...rest } = init ?? {};
    return this.request<Artifact>(path, {
      method: "GET",
      ...rest,
    });
  }

  async listTools(init?: FetchInit): Promise<ToolDescription[]> {
    const query = init?.query ? new URLSearchParams(init.query).toString() : "";
    const path = `/v1/tools${query ? `?${query}` : ""}`;
    const { query: _ignored, ...rest } = init ?? {};
    return this.request<ToolDescription[]>(path, {
      method: "GET",
      ...rest,
    });
  }

  streamRun(runId: string, options: StreamOptions): () => void {
    if (typeof window === "undefined") {
      throw new Error("Run streaming is only available in the browser");
    }

    const url = new URL(`${this.baseUrl}/v1/stream/${encodeURIComponent(runId)}`);
    if (options.lastEventId) {
      url.searchParams.set("last_event_id", options.lastEventId);
    }
    if (options.traceId) {
      url.searchParams.set("trace_id", options.traceId);
    }
    if (options.projectId) {
      url.searchParams.set("project_id", options.projectId);
    }

    const retryDelays = options.retryDelays ?? [500, 1500, 3000];
    let retryAttempts = 0;
    let closed = false;
    let eventSource: EventSource | null = null;

    const teardown = () => {
      closed = true;
      eventSource?.close();
      eventSource = null;
    };

    const start = () => {
      if (closed) {
        return;
      }
      eventSource?.close();
      eventSource = new EventSource(url.toString(), { withCredentials: false });
      eventSource.onopen = () => {
        retryAttempts = 0;
        options.onOpen?.();
      };
      eventSource.onmessage = (message: MessageEvent<string>) => {
        if (!message.data) {
          return;
        }
        try {
          const payload = JSON.parse(message.data) as RunStreamEvent;
          options.onEvent(payload);
        } catch (error) {
          options.onError?.(error);
        }
      };
      eventSource.onerror = (error) => {
        eventSource?.close();
        if (closed) {
          return;
        }
        const delay = retryDelays[Math.min(retryAttempts, retryDelays.length - 1)];
        retryAttempts += 1;
        options.onError?.(error);
        setTimeout(start, delay);
      };
    };

    const abortController = new AbortController();
    const signals = [abortController.signal, options.signal].filter(Boolean) as AbortSignal[];
    const abort = () => {
      teardown();
    };
    for (const sig of signals) {
      if (sig.aborted) {
        abort();
      } else {
        sig.addEventListener("abort", abort, { once: true });
      }
    }

    start();
    return () => {
      abortController.abort();
      teardown();
    };
  }

  private async request<T>(path: string, init: FetchInit): Promise<T> {
    const { retryDelays = [], traceId, ...rest } = init;
    const headers = new Headers(rest.headers);
    delete (rest as RequestInit).headers;
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    if (traceId && !headers.has("x-trace-id")) {
      headers.set("x-trace-id", traceId);
    }

    const execute = async (attempt: number): Promise<T> => {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...rest,
        headers,
      });

      if (!response.ok) {
        if (shouldRetry(response.status) && attempt < retryDelays.length) {
          await delay(retryDelays[attempt]);
          return execute(attempt + 1);
        }
        const text = await safeRead(response);
        throw new Error(`Request failed with status ${response.status}: ${text}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    };

    return execute(0);
  }
}

function shouldRetry(status: number): boolean {
  return status >= 500 || status === 429;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeRead(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    return error instanceof Error ? error.message : "unknown";
  }
}
