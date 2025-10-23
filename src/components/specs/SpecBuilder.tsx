"use client";

import React from "react";
import { useAgentApi, useStudioEnvironment } from "@/providers/studio/StudioProvider";
import { SpecJsonPreview } from "./SpecJsonPreview";
import type { Run, RunCreateRequest, RunStreamEvent, ToolDescription } from "@/lib/api/types";
import { useRunStream } from "@/hooks/studio/useRunStream";
import { isFeatureEnabled } from "@/lib/flags";

export interface SpecFormState {
  name: string;
  summary: string;
  instructions: string;
  temperature: number;
  goal: string;
  context: string;
  selectedTools: string[];
}

export const INITIAL_FORM_STATE: SpecFormState = {
  name: "Untitled Spec",
  summary: "",
  instructions: "",
  temperature: 0.2,
  goal: "",
  context: "",
  selectedTools: [],
};

export function buildRunRequest(form: SpecFormState): RunCreateRequest {
  return {
    spec: {
      name: form.name,
      summary: form.summary,
      instructions: form.instructions,
      config: {
        model: "claude-3.5-sonnet",
        temperature: form.temperature,
      },
      tools: form.selectedTools,
    },
    input: {
      goal: form.goal,
      context: form.context,
    },
    metadata: {
      source: "vibe-studio",
    },
  };
}

export function SpecBuilder(): React.ReactNode {
  const { createRun, cancelRun, fetchTools } = useAgentApi();
  const { snapshot } = useStudioEnvironment();
  const [form, setForm] = React.useState<SpecFormState>(INITIAL_FORM_STATE);
  const [tools, setTools] = React.useState<ToolDescription[]>([]);
  const [toolsError, setToolsError] = React.useState<string | null>(null);
  const [toolsLoaded, setToolsLoaded] = React.useState(false);
  const [activeRun, setActiveRun] = React.useState<Run | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const streamingEnabled = isFeatureEnabled("studio.streamingPanes");
  const streamState = useRunStream(activeRun?.id ?? null, streamingEnabled);
  const hasStreamError = streamState.error != null;

  React.useEffect(() => {
    if (!snapshot.baseUrl) {
      return;
    }
    let mounted = true;
    setToolsLoaded(false);
    fetchTools()
      .then((list) => {
        if (mounted) {
          setTools(list);
          setToolsError(null);
          setToolsLoaded(true);
        }
      })
      .catch((err) => {
        if (mounted) {
          setToolsError(err instanceof Error ? err.message : String(err));
          setToolsLoaded(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, [fetchTools, snapshot.baseUrl]);

  const requestBody = React.useMemo<RunCreateRequest>(() => buildRunRequest(form), [form]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const run = await createRun(requestBody);
      setActiveRun(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onCancel = async () => {
    if (!activeRun) {
      return;
    }
    try {
      await cancelRun(activeRun.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleTool = (tool: string) => {
    setForm((prev) => {
      const selected = new Set(prev.selectedTools);
      if (selected.has(tool)) {
        selected.delete(tool);
      } else {
        selected.add(tool);
      }
      return { ...prev, selectedTools: Array.from(selected).sort() };
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Spec Name</label>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                placeholder="E.g. Pull request triage"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Summary</label>
              <input
                value={form.summary}
                onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                placeholder="Describe what the spec accomplishes"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Goal</label>
              <textarea
                value={form.goal}
                onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                rows={3}
                placeholder="What should the agent deliver?"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Context</label>
              <textarea
                value={form.context}
                onChange={(event) => setForm((prev) => ({ ...prev, context: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                rows={3}
                placeholder="Add constraints, repositories, or environment hints"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Instructions</label>
              <textarea
                value={form.instructions}
                onChange={(event) => setForm((prev) => ({ ...prev, instructions: event.target.value }))}
                className="mt-1 h-48 w-full rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                placeholder="System instructions guiding the MCP runtime"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Temperature</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={form.temperature}
                onChange={(event) => setForm((prev) => ({ ...prev, temperature: Number(event.target.value) }))}
                className="mt-1 w-32 rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {toolsLoaded ? (
          tools.length > 0 ? (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-4">
            <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Tools</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {tools.map((tool) => (
                <label key={tool.name} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-900/80 bg-slate-900/40 p-3 text-sm text-slate-200 hover:border-emerald-400/40">
                  <input
                    type="checkbox"
                    checked={form.selectedTools.includes(tool.name)}
                    onChange={() => toggleTool(tool.name)}
                    className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-400 focus:ring-emerald-400"
                  />
                  <span>
                    <span className="font-semibold text-white">{tool.name}</span>
                    {tool.description && <span className="mt-1 block text-xs text-slate-400">{tool.description}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
          ) : (
            <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-400">
              {toolsError ? `Unable to load tools: ${toolsError}` : "No tools reported by agent-mcp."}
            </div>
          )
        ) : (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-400">
            Checking agent-mcp for available tools...
          </div>
        )}

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-5 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating run..." : "Create Run"}
          </button>
          {activeRun && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
            >
              Cancel Run
            </button>
          )}
          {activeRun && (
            <span className="text-xs text-slate-400">Run ID: {activeRun.id}</span>
          )}
          {activeRun?.status && (
            <span className="text-xs text-emerald-300">Status: {activeRun.status}</span>
          )}
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Request Body</p>
          <SpecJsonPreview value={requestBody} />
          {hasStreamError && (
            <p className="text-xs text-amber-300">Streaming encountered an issue. Retry once connectivity stabilizes.</p>
          )}
        </div>
        {streamingEnabled && activeRun ? (
          <StreamingPane events={streamState.events} />
        ) : (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-400">
            Streaming panes are disabled until PR-02.
          </div>
        )}
      </div>
    </div>
  );
}

interface StreamingPaneProps {
  events: RunStreamEvent[];
}

function StreamingPane({ events }: StreamingPaneProps): React.ReactNode {
  const [activeTab, setActiveTab] = React.useState("plan");
  const panes: { id: string; label: string; filter: (event: any) => boolean }[] = [
    { id: "plan", label: "Plan", filter: (event) => event.type === "plan" },
    { id: "patch", label: "Patch Loop", filter: (event) => event.type === "patch" },
    { id: "log", label: "Logs", filter: (event) => event.type === "log" || event.type === "status" },
    { id: "artifact", label: "Artifacts", filter: (event) => event.type === "artifact" },
  ];

  const activePane = panes.find((pane) => pane.id === activeTab) ?? panes[0];
  const filteredEvents = events.filter(activePane.filter);

  return (
    <div className="flex h-full min-h-[260px] flex-col rounded-xl border border-slate-800/60 bg-slate-950/60">
      <div className="flex border-b border-slate-800/60">
        {panes.map((pane) => (
          <button
            key={pane.id}
            type="button"
            onClick={() => setActiveTab(pane.id)}
            className={
              "flex-1 border-b-2 px-4 py-2 text-sm font-semibold transition" +
              (activeTab === pane.id
                ? " border-emerald-400 text-emerald-200"
                : " border-transparent text-slate-400 hover:text-slate-200")
            }
          >
            {pane.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-xs text-slate-200">
        {filteredEvents.length > 0 ? (
          filteredEvents.map((event) => (
            <article key={`${event.id}-${event.sequence}`} className="mb-3 rounded border border-slate-800/60 bg-slate-900/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">{event.type}</p>
              <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-200">
                {typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload, null, 2)}
              </pre>
            </article>
          ))
        ) : (
          <p className="text-slate-400">No events yet.</p>
        )}
      </div>
    </div>
  );
}
