"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  Shield,
  AlertCircle,
  Server,
  XCircle,
} from "lucide-react";

import { getMCPClient, MCPHealthStatus, SentinelTokenStatus } from "@/lib/mcp/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SystemHealthDashboardProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface HealthState {
  agent: MCPHealthStatus;
  sentinel_token: SentinelTokenStatus;
}

function getStatusIcon(status: "healthy" | "unhealthy" | "unknown" | "degraded"): ReactNode {
  switch (status) {
    case "healthy":
      return <CheckCircle2 className="h-6 w-6 text-emerald-400" aria-hidden />;
    case "unhealthy":
      return <XCircle className="h-6 w-6 text-rose-400" aria-hidden />;
    default:
      return <AlertCircle className="h-6 w-6 text-amber-400" aria-hidden />;
  }
}

function getStatusBadge(status: "healthy" | "unhealthy" | "unknown"): ReactNode {
  const variants = {
    healthy: "success" as const,
    unhealthy: "destructive" as const,
    unknown: "secondary" as const,
  };

  return (
    <Badge variant={variants[status]} className="uppercase">
      {status}
    </Badge>
  );
}

function formatTokenExpiry(expiresAt?: string): string {
  if (!expiresAt) {
    return "Unknown";
  }
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMinutes = Math.floor((expiry.getTime() - now.getTime()) / 1000 / 60);

  if (Number.isNaN(diffMinutes)) {
    return "Unknown";
  }
  if (diffMinutes < 0) {
    return "Expired";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h ${diffMinutes % 60}m`;
}

export function SystemHealthDashboard({
  autoRefresh = true,
  refreshInterval = 30_000,
}: SystemHealthDashboardProps): ReactNode {
  const [healthState, setHealthState] = useState<HealthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const overallStatus = useMemo<"healthy" | "unhealthy" | "unknown" | "degraded">(() => {
    if (!healthState) {
      return "unknown";
    }

    if (healthState.agent.status === "healthy" && healthState.sentinel_token.available) {
      return "healthy";
    }

    if (healthState.agent.status === "unhealthy" || !healthState.sentinel_token.available) {
      return "degraded";
    }

    return "unknown";
  }, [healthState]);

  const checkHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const client = getMCPClient();
      const health = await client.checkAllHealth();
      setHealthState(health);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();

    if (!autoRefresh) {
      return undefined;
    }

    const intervalId = window.setInterval(checkHealth, refreshInterval);
    return () => window.clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, checkHealth]);

  return (
    <div className="space-y-6">
      <Card className="border-slate-800/80 bg-slate-950/60">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-lg">Project Health Status</CardTitle>
            <CardDescription>
              {lastChecked ? `Last checked: ${lastChecked.toLocaleTimeString()}` : "Not checked yet"}
            </CardDescription>
          </div>
          <Button onClick={() => void checkHealth()} disabled={isLoading} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/80">
              {getStatusIcon(overallStatus)}
            </div>
            <div>
              <p className="text-xl font-semibold text-slate-100">
                {overallStatus === "healthy"
                  ? "All Systems Operational"
                  : overallStatus === "degraded"
                    ? "System Degraded"
                    : "Checking Status..."}
              </p>
              <p className="text-sm text-slate-400">
                Project ID: {process.env.NEXT_PUBLIC_PROJECT_ID ?? "unknown"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Health check error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {healthState?.agent ? (
          <Card className="border-slate-800/80 bg-slate-950/60">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-100">
                <Server className="h-5 w-5" aria-hidden />
                <CardTitle className="text-base">MCP Agent</CardTitle>
              </div>
              {getStatusBadge(healthState.agent.status)}
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-200">
              {healthState.agent.version ? (
                <CardDescription>Version: {healthState.agent.version}</CardDescription>
              ) : null}

              {healthState.agent.details?.mcp_servers ? (
                <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-3">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                    <Database className="h-4 w-4" aria-hidden />
                    MCP servers
                  </p>
                  <div className="space-y-1">
                    {Object.entries(
                      healthState.agent.details.mcp_servers as Record<string, string>,
                    ).map(([name, serverStatus]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-md px-2 py-1 text-xs text-slate-200"
                      >
                        <span className="font-mono text-slate-300">{name}</span>
                        <Badge
                          variant={serverStatus === "healthy" ? "success" : "destructive"}
                          className="capitalize"
                        >
                          {serverStatus}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {healthState.agent.details?.error ? (
                <Alert variant="destructive">
                  <AlertTitle>Agent error</AlertTitle>
                  <AlertDescription className="text-xs">
                    {String(healthState.agent.details.error)}
                  </AlertDescription>
                </Alert>
              ) : null}

              {healthState.agent.timestamp ? (
                <p className="text-xs text-slate-400">
                  Last update: {new Date(healthState.agent.timestamp).toLocaleString()}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {healthState?.sentinel_token ? (
          <Card className="border-slate-800/80 bg-slate-950/60">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-100">
                <Shield className="h-5 w-5" aria-hidden />
                <CardTitle className="text-base">GitHub Token</CardTitle>
              </div>
              <Badge
                variant={healthState.sentinel_token.available ? "success" : "destructive"}
                className="uppercase"
              >
                {healthState.sentinel_token.available ? "Available" : "Unavailable"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-200">
              <CardDescription>Managed by Vibe-Sentinel control plane</CardDescription>

              {healthState.sentinel_token.available ? (
                <>
                  {healthState.sentinel_token.expires_at ? (
                    <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-3">
                      <div className="flex items-center justify-between text-xs text-slate-200">
                        <span className="flex items-center gap-2 font-semibold text-slate-100">
                          <Clock className="h-4 w-4" aria-hidden />
                          Expires in
                        </span>
                        <span className="font-mono text-slate-100">
                          {formatTokenExpiry(healthState.sentinel_token.expires_at)}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {healthState.sentinel_token.scopes?.length ? (
                    <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Granted scopes</p>
                      <div className="flex flex-wrap gap-2">
                        {healthState.sentinel_token.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" className="text-[11px] capitalize">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <Alert>
                    <AlertDescription className="text-xs text-slate-200">
                      ✓ GitHub credentials are managed centrally by Sentinel. No local storage.
                    </AlertDescription>
                  </Alert>
                </>
              ) : (
                <Alert variant="destructive">
                  <AlertTitle>Token unavailable</AlertTitle>
                  <AlertDescription className="text-xs">
                    {healthState.sentinel_token.message ?? "Unable to retrieve GitHub token from Sentinel."}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card className="border-slate-800/80 bg-slate-950/60">
        <CardHeader>
          <CardTitle className="text-base">System architecture</CardTitle>
          <CardDescription>How Vibe-Sentinel and mcp-agent connect to this project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-slate-300">
          <p>
            <span className="font-semibold text-slate-100">OAuth:</span> Managed by Vibe-SaaS console (not stored locally)
          </p>
          <p>
            <span className="font-semibold text-slate-100">GitHub Tokens:</span> Short-lived tokens issued by Vibe-Sentinel
            control plane
          </p>
          <p>
            <span className="font-semibold text-slate-100">MCP Agent:</span> Workflow engine running on this project VPS
          </p>
          <p>
            <span className="font-semibold text-slate-100">Instance:</span> Dedicated VPS for project
            {" "}
            {process.env.NEXT_PUBLIC_PROJECT_ID ?? "default"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
