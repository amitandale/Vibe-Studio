import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SystemHealthDashboard } from "@/components/system/SystemHealthDashboard";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "System Settings",
  description: "Project health and MCP service monitoring",
};

export default function SystemSettingsPage(): ReactNode {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-slate-100">System Health</h3>
        <p className="text-sm text-slate-400">Monitor the status of MCP services for this project instance.</p>
      </div>

      <Separator className="border-slate-800" />

      <SystemHealthDashboard autoRefresh refreshInterval={30_000} />

      <Separator className="border-slate-800" />

      <div className="space-y-4 rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
        <div>
          <h4 className="text-base font-semibold text-slate-100">Service Endpoints</h4>
          <p className="text-sm text-slate-400">Configured MCP service URLs for this project.</p>
        </div>

        <dl className="space-y-3 text-sm text-slate-200">
          <div className="flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 font-mono">
            <dt className="text-slate-400">MCP Agent (local)</dt>
            <dd>{process.env.NEXT_PUBLIC_MCP_BASE_URL ?? "http://localhost:2024"}</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 font-mono">
            <dt className="text-slate-400">Vibe Sentinel (control plane)</dt>
            <dd>{process.env.NEXT_PUBLIC_SENTINEL_URL ?? "Not configured"}</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 font-mono">
            <dt className="text-slate-400">Project ID</dt>
            <dd>{process.env.NEXT_PUBLIC_PROJECT_ID ?? "default"}</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 font-mono">
            <dt className="text-slate-400">Console URL</dt>
            <dd>{process.env.NEXT_PUBLIC_VIBE_CONSOLE_URL ?? "Not configured"}</dd>
          </div>
        </dl>

        <p className="text-xs text-slate-400">
          ⓘ GitHub OAuth is managed by the Vibe-SaaS console. Tokens are provisioned by Sentinel.
        </p>
      </div>
    </div>
  );
}
