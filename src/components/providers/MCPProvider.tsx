"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { MCPClient, MCPServiceConfig, getMCPClient } from "@/lib/mcp/client";

type MCPContextValue = {
  client: MCPClient | null;
  isInitialized: boolean;
  error: string | null;
  projectId: string;
};

const MCPContext = createContext<MCPContextValue | undefined>(undefined);

export function useMCP(): MCPContextValue {
  const context = useContext(MCPContext);
  if (context === undefined) {
    throw new Error("useMCP must be used within MCPProvider");
  }
  return context;
}

interface MCPProviderProps {
  children: ReactNode;
  config?: MCPServiceConfig;
}

export function MCPProvider({ children, config }: MCPProviderProps): ReactNode {
  const [client, setClient] = useState<MCPClient | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>("");

  useEffect(() => {
    try {
      const mcpConfig =
        config ?? {
          mcpAgentUrl: process.env.NEXT_PUBLIC_MCP_BASE_URL ?? "http://localhost:2024",
          sentinelUrl: process.env.NEXT_PUBLIC_SENTINEL_URL ?? "",
          projectId: process.env.NEXT_PUBLIC_PROJECT_ID ?? "default",
        };

      setProjectId(mcpConfig.projectId);

      const mcpClient = getMCPClient(mcpConfig);
      setClient(mcpClient);
      setIsInitialized(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize MCP client");
      setIsInitialized(false);
    }
  }, [config]);

  return (
    <MCPContext.Provider value={{ client, isInitialized, error, projectId }}>
      {children}
    </MCPContext.Provider>
  );
}
