"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AgentMcpClient } from "@/lib/api/client";
import type { Run, RunCreateRequest, RunStreamEvent, ToolDescription } from "@/lib/api/types";
import { detectMcpEnvironment, type McpEnvironmentSnapshot } from "@/lib/env/detectMcpEnv";

interface EnvironmentContextValue {
  snapshot: McpEnvironmentSnapshot;
  refresh: () => Promise<void>;
}

interface StreamOptions {
  signal?: AbortSignal;
  onError?: (error: unknown) => void;
}

interface ApiContextValue {
  client: AgentMcpClient | null;
  createRun: (payload: RunCreateRequest) => Promise<Run>;
  cancelRun: (id: string) => Promise<void>;
  streamRun: (id: string, handler: (event: RunStreamEvent) => void, options?: StreamOptions) => () => void;
  fetchTools: () => Promise<ToolDescription[]>;
}

const EnvironmentContext = createContext<EnvironmentContextValue | undefined>(undefined);
const ApiContext = createContext<ApiContextValue | undefined>(undefined);

const defaultSnapshot: McpEnvironmentSnapshot = {
  status: "OFFLINE",
  baseUrl: null,
  timestamp: Date.now(),
};

const toolsCache = new Map<string, Promise<ToolDescription[]>>();

type StudioProviderOverrides = {
  environment?: McpEnvironmentSnapshot;
  api?: Partial<ApiContextValue>;
};

interface StudioProviderProps {
  children: React.ReactNode;
  overrides?: StudioProviderOverrides;
}

export function StudioProvider({ children, overrides }: StudioProviderProps): React.ReactNode {
  const manualEnvironment = overrides?.environment;
  const manualApi = overrides?.api;
  const [snapshot, setSnapshot] = useState<McpEnvironmentSnapshot>(manualEnvironment ?? defaultSnapshot);
  const clientRef = useRef<AgentMcpClient | null>(null);

  const refresh = useCallback(async () => {
    if (manualEnvironment) {
      setSnapshot(manualEnvironment);
      return;
    }
    const result = await detectMcpEnvironment();
    setSnapshot(result);
  }, [manualEnvironment]);

  useEffect(() => {
    if (manualEnvironment) {
      setSnapshot(manualEnvironment);
      return;
    }
    void refresh();
  }, [manualEnvironment, refresh]);

  useEffect(() => {
    if (snapshot.baseUrl) {
      clientRef.current = new AgentMcpClient(snapshot.baseUrl);
    } else {
      clientRef.current = null;
    }
  }, [snapshot.baseUrl]);

  const apiValue = useMemo<ApiContextValue>(() => {
    if (manualApi) {
      return {
        client: manualApi.client ?? null,
        createRun: manualApi.createRun ?? (async () => {
          throw new Error("MCP client unavailable");
        }),
        cancelRun: manualApi.cancelRun ?? (async () => {
          throw new Error("MCP client unavailable");
        }),
        streamRun:
          manualApi.streamRun ??
          (() => () => {
            throw new Error("MCP client unavailable");
          }),
        fetchTools:
          manualApi.fetchTools ??
          (async () => {
            throw new Error("MCP client unavailable");
          }),
      };
    }

    return {
      client: clientRef.current,
      createRun: async (payload) => {
        if (!clientRef.current) {
          throw new Error("MCP client unavailable");
        }
        return clientRef.current.createRun(payload);
      },
      cancelRun: async (runId) => {
        if (!clientRef.current) {
          throw new Error("MCP client unavailable");
        }
        await clientRef.current.cancelRun(runId);
      },
      streamRun: (runId, handler, options) => {
        if (!clientRef.current) {
          throw new Error("MCP client unavailable");
        }
        return clientRef.current.streamRun(runId, {
          signal: options?.signal,
          onEvent: handler,
          onError: options?.onError,
        });
      },
      fetchTools: async () => {
        if (!clientRef.current) {
          throw new Error("MCP client unavailable");
        }
        const cacheKey = clientRef.current.getBaseUrl();
        if (!toolsCache.has(cacheKey)) {
          toolsCache.set(cacheKey, clientRef.current.listTools().catch((error) => {
            toolsCache.delete(cacheKey);
            throw error;
          }));
        }
        return toolsCache.get(cacheKey)!;
      },
    };
  }, [manualApi, snapshot.baseUrl]);

  const environmentValue = useMemo<EnvironmentContextValue>(() => ({
    snapshot,
    refresh,
  }), [snapshot, refresh]);

  return (
    <EnvironmentContext.Provider value={environmentValue}>
      <ApiContext.Provider value={apiValue}>{children}</ApiContext.Provider>
    </EnvironmentContext.Provider>
  );
}

export function useStudioEnvironment(): EnvironmentContextValue {
  const value = useContext(EnvironmentContext);
  if (!value) {
    throw new Error("useStudioEnvironment must be used within StudioProvider");
  }
  return value;
}

export function useAgentApi(): ApiContextValue {
  const value = useContext(ApiContext);
  if (!value) {
    throw new Error("useAgentApi must be used within StudioProvider");
  }
  return value;
}
