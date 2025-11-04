"use client";

import React from "react";
import { useStudioEnvironment } from "@/providers/studio/StudioProvider";
import { AgentMcpClient } from "@/lib/api/client";
import type { ProviderTokenRecord } from "@/lib/api/types";
import { formatDistanceToNow } from "date-fns";

export default function SettingsPage(): React.ReactNode {
  const { snapshot, refresh } = useStudioEnvironment();
  const [tokens, setTokens] = React.useState<ProviderTokenRecord[]>([]);
  const [loadingTokens, setLoadingTokens] = React.useState(false);
  const [tokenError, setTokenError] = React.useState<string | null>(null);

  const projectId = React.useMemo(() => process.env.NEXT_PUBLIC_PROJECT_ID ?? "default", []);

  const fetchTokens = React.useCallback(async () => {
    const baseUrl = process.env.NEXT_PUBLIC_MCP_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? window.location.origin;
    try {
      setLoadingTokens(true);
      setTokenError(null);
      const client = new AgentMcpClient(baseUrl.replace(/\/$/, ""));
      const response = await client.listProjectTokens(projectId);
      setTokens(response);
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingTokens(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void fetchTokens();
  }, [fetchTokens]);

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Settings</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-2 text-sm text-slate-400">
          Environment detection prefers <code className="text-emerald-300">NEXT_PUBLIC_MCP_BASE_URL</code>. When unset, the UI probes
          the current origin&apos;s <code className="text-emerald-300">/health</code> endpoint with a 2s timeout.
        </p>
      </header>
      <section className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <h2 className="text-lg font-semibold text-white">agent-mcp Connectivity</h2>
        <dl className="mt-4 grid gap-3 text-sm text-slate-300">
          <div>
            <dt className="uppercase tracking-wide text-slate-500">Status</dt>
            <dd className="mt-1 text-emerald-200">{snapshot.status}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-slate-500">Base URL</dt>
            <dd className="mt-1 font-mono text-xs text-slate-200">{snapshot.baseUrl ?? "Not detected"}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-slate-500">Latency</dt>
            <dd className="mt-1 text-slate-200">{snapshot.latencyMs ? `${snapshot.latencyMs.toFixed(0)} ms` : "Unknown"}</dd>
          </div>
          {snapshot.reason && (
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Diagnostics</dt>
              <dd className="mt-1 text-slate-200">{snapshot.reason}</dd>
            </div>
          )}
        </dl>
        <button
          type="button"
          onClick={() => refresh()}
          className="mt-6 rounded-lg border border-slate-800/80 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-slate-900/80"
        >
          Retry detection
        </button>
      </section>
      <section className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">LLM Provider Tokens</h2>
          <button
            type="button"
            onClick={() => void fetchTokens()}
            className="rounded-lg border border-slate-800/70 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Tokens are encrypted server-side and scoped per project. Re-run onboarding to add or rotate credentials.
        </p>
        {tokenError ? (
          <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{tokenError}</p>
        ) : null}
        <ul className="mt-4 space-y-2">
          {tokens.length === 0 && !loadingTokens ? (
            <li className="rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-400">
              No tokens stored for this project.
            </li>
          ) : null}
          {tokens.map((token) => (
            <li key={token.id} className="rounded-lg border border-slate-800/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-100">{token.label ?? token.providerId}</p>
                  <p className="text-xs text-slate-500">Provider: {token.providerId}</p>
                </div>
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">{token.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Added {formatDistanceToNow(new Date(token.createdAt), { addSuffix: true })}
              </p>
            </li>
          ))}
        </ul>
        {loadingTokens ? <p className="mt-3 text-xs text-slate-500">Loading tokens…</p> : null}
      </section>
    </div>
  );
}
