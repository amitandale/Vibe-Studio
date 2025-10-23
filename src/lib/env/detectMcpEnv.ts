export type EnvironmentStatus = "ONLINE" | "DEGRADED" | "OFFLINE";

export interface McpEnvironmentSnapshot {
  status: EnvironmentStatus;
  baseUrl: string | null;
  latencyMs?: number;
  reason?: string;
  timestamp: number;
}

const PROBE_PATH = "/health";
const DEFAULT_TIMEOUT = 2000;

function resolveBaseUrl(): string | null {
  if (typeof process !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_MCP_BASE_URL?.trim();
    if (envUrl) {
      return envUrl.replace(/\/$/, "");
    }
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return null;
}

export async function detectMcpEnvironment(signal?: AbortSignal): Promise<McpEnvironmentSnapshot> {
  const baseUrl = resolveBaseUrl();
  const timestamp = Date.now();

  if (!baseUrl) {
    return {
      status: "OFFLINE",
      baseUrl: null,
      reason: "No base URL available",
      timestamp,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  const composedSignal = mergeAbortSignals(signal, controller.signal);

  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}${PROBE_PATH}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: composedSignal,
    });
    const latencyMs = Date.now() - start;
    if (response.ok) {
      return {
        status: "ONLINE",
        baseUrl,
        latencyMs,
        timestamp,
      };
    }

    return {
      status: "DEGRADED",
      baseUrl,
      latencyMs,
      reason: `Unexpected status: ${response.status}`,
      timestamp,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: process.env.NEXT_PUBLIC_MCP_BASE_URL ? "DEGRADED" : "OFFLINE",
      baseUrl,
      reason: message,
      timestamp,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function mergeAbortSignals(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const filtered = signals.filter(Boolean) as AbortSignal[];
  if (filtered.length === 0) {
    return undefined;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const sig of filtered) {
    if (sig.aborted) {
      abort();
      return controller.signal;
    }
    sig.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}
