export interface MCPServiceConfig {
  mcpAgentUrl: string;
  sentinelUrl: string;
  projectId: string;
}

export interface MCPHealthStatus {
  service: string;
  status: "healthy" | "unhealthy" | "unknown";
  version?: string;
  timestamp?: string;
  details?: Record<string, unknown>;
}

export interface SentinelTokenStatus {
  available: boolean;
  expires_at?: string;
  scopes?: string[];
  message?: string;
}

export class MCPClient {
  private config: MCPServiceConfig;
  private abortController: AbortController;

  constructor(config: MCPServiceConfig) {
    this.config = {
      ...config,
      mcpAgentUrl: config.mcpAgentUrl.replace(/\/$/, ""),
    };
    this.abortController = new AbortController();
  }

  private get baseHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "X-Project-ID": this.config.projectId,
    };
  }

  private get baseUrl(): string {
    return this.config.mcpAgentUrl;
  }

  async checkAgentHealth(): Promise<MCPHealthStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.baseHeaders,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        return {
          service: "mcp-agent",
          status: "unhealthy",
          details: { error: `HTTP ${response.status}` },
        };
      }

      const data = (await response.json()) as Record<string, any>;
      return {
        service: "mcp-agent",
        status: data.status === "healthy" ? "healthy" : "unhealthy",
        version: data.version,
        timestamp: data.timestamp,
        details: {
          services: data.services,
          mcp_servers: data.mcp_servers,
        },
      };
    } catch (error) {
      return {
        service: "mcp-agent",
        status: "unhealthy",
        details: { error: error instanceof Error ? error.message : "Unknown error" },
      };
    }
  }

  async checkSentinelTokenStatus(): Promise<SentinelTokenStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/sentinel/token-status`, {
        method: "GET",
        headers: this.baseHeaders,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        return {
          available: false,
          message: `Token check failed: HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as Record<string, any>;
      return {
        available: Boolean(data.available),
        expires_at: data.expires_at,
        scopes: data.scopes,
        message: data.message,
      };
    } catch (error) {
      return {
        available: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async checkAllHealth(): Promise<{
    agent: MCPHealthStatus;
    sentinel_token: SentinelTokenStatus;
  }> {
    const [agentHealth, tokenStatus] = await Promise.allSettled([
      this.checkAgentHealth(),
      this.checkSentinelTokenStatus(),
    ]);

    return {
      agent:
        agentHealth.status === "fulfilled"
          ? agentHealth.value
          : { service: "mcp-agent", status: "unknown", details: { error: "Failed to check" } },
      sentinel_token:
        tokenStatus.status === "fulfilled"
          ? tokenStatus.value
          : { available: false, message: "Failed to check token status" },
    };
  }

  async invokeWorkflow<TInput, TOutput>(
    workflowId: string,
    input: TInput,
    options?: {
      projectId?: string;
      traceId?: string;
    },
  ): Promise<{ runId: string; status: string; output?: TOutput }> {
    const response = await fetch(`${this.baseUrl}/v1/workflows/${workflowId}/invoke`, {
      method: "POST",
      headers: this.baseHeaders,
      body: JSON.stringify({
        input,
        project_id: options?.projectId ?? this.config.projectId,
        trace_id: options?.traceId,
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Workflow invocation failed: ${response.status}`);
    }

    return (await response.json()) as { runId: string; status: string; output?: TOutput };
  }

  streamWorkflow(
    runId: string,
    onEvent: (event: unknown) => void,
    onError?: (error: Error) => void,
  ): () => void {
    if (typeof window === "undefined") {
      throw new Error("Workflow streaming is only available in the browser");
    }

    const url = new URL(`${this.baseUrl}/v1/stream/${encodeURIComponent(runId)}`);
    url.searchParams.set("project_id", this.config.projectId);

    const eventSource = new EventSource(url.toString());

    eventSource.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as unknown;
        onEvent(data);
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error("Parse error"));
      }
    };

    eventSource.onerror = () => {
      onError?.(new Error("EventSource connection error"));
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }

  abort(): void {
    this.abortController.abort();
    this.abortController = new AbortController();
  }
}

let mcpClientInstance: MCPClient | null = null;

export function getMCPClient(config?: MCPServiceConfig): MCPClient {
  if (!mcpClientInstance && config) {
    mcpClientInstance = new MCPClient(config);
  }

  if (!mcpClientInstance) {
    throw new Error("MCPClient not initialized. Provide config on first call.");
  }

  return mcpClientInstance;
}
