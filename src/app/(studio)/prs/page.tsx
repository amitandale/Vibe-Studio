"use client";

import React from "react";
import { Loader2, MessageSquare, RefreshCw, SendHorizontal } from "lucide-react";
import { AgentMcpClient } from "@/lib/api/client";
import type { PullRequestDetail, PullRequestMessage, PullRequestStatus, PullRequestSummary } from "@/lib/api/types";
import { extractConversation, formatPullRequestStatus, isActionableStatus, sortPullRequests } from "@/lib/prs";
import { cn } from "@/lib/utils";

interface DraftMessage {
  content: string;
  sending: boolean;
}

function resolveBaseUrl(): string | null {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MCP_BASE_URL) {
    return process.env.NEXT_PUBLIC_MCP_BASE_URL.replace(/\/$/, "");
  }
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return null;
}

function resolveProjectId(): string {
  const id = process.env.NEXT_PUBLIC_PROJECT_ID ?? "default";
  return id.trim() || "default";
}

export default function PullRequestsPage(): React.ReactNode {
  const projectId = React.useMemo(() => resolveProjectId(), []);
  const [baseUrl, setBaseUrl] = React.useState<string | null>(() => resolveBaseUrl());
  const clientRef = React.useRef<AgentMcpClient | null>(null);
  const [items, setItems] = React.useState<PullRequestSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<PullRequestDetail | null>(null);
  const [loadingList, setLoadingList] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<DraftMessage>({ content: "", sending: false });

  React.useEffect(() => {
    if (!baseUrl) {
      setBaseUrl(resolveBaseUrl());
      return;
    }
    clientRef.current = new AgentMcpClient(baseUrl);
  }, [baseUrl]);

  const fetchList = React.useCallback(async () => {
    if (!clientRef.current) {
      return;
    }
    setLoadingList(true);
    setError(null);
    try {
      const response = await clientRef.current.listPullRequests(projectId);
      setItems(sortPullRequests(response));
      if (!selectedId && response.length > 0) {
        setSelectedId(response[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingList(false);
    }
  }, [projectId, selectedId]);

  const fetchDetail = React.useCallback(
    async (id: string) => {
      if (!clientRef.current) {
        return;
      }
      setLoadingDetail(true);
      setError(null);
      try {
        const response = await clientRef.current.fetchPullRequest(projectId, id);
        setDetail(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingDetail(false);
      }
    },
    [projectId],
  );

  React.useEffect(() => {
    void fetchList();
  }, [fetchList]);

  React.useEffect(() => {
    if (selectedId) {
      void fetchDetail(selectedId);
    }
  }, [fetchDetail, selectedId]);

  const handleStatusChange = React.useCallback(
    async (status: PullRequestStatus) => {
      if (!clientRef.current || !detail) {
        return;
      }
      setLoadingDetail(true);
      try {
        const response = await clientRef.current.updatePullRequestStatus(projectId, detail.id, status);
        setDetail(response);
        setItems((prev) => sortPullRequests(prev.map((item) => (item.id === response.id ? response : item))));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingDetail(false);
      }
    },
    [detail, projectId],
  );

  const handleSendMessage = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!clientRef.current || !detail || !draft.content.trim()) {
        return;
      }
      setDraft((prev) => ({ ...prev, sending: true }));
      try {
        const response = await clientRef.current.postPullRequestMessage(projectId, detail.id, draft.content.trim(), "user");
        const nextConversation: PullRequestMessage[] = [...extractConversation(detail), response];
        setDetail({ ...detail, metadata: { ...detail.metadata, conversation: nextConversation } });
        setDraft({ content: "", sending: false });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setDraft((prev) => ({ ...prev, sending: false }));
      }
    },
    [detail, draft.content, projectId],
  );

  const conversation = React.useMemo(() => (detail ? extractConversation(detail) : []), [detail]);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/80">Change Requests</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Pull Requests</h1>
          <p className="mt-1 text-sm text-slate-400">
            Each PR originates from the onboarding assistant or MCP runs. Track status, review conversation history, and reply
            with additional guidance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchList()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
        >
          {loadingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh list
        </button>
      </header>
      {error ? (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}
      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]">
        <section className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Requests</h2>
          <div className="flex-1 space-y-2 overflow-y-auto pr-2">
            {loadingList && items.length === 0 ? (
              <p className="text-sm text-slate-400">Loading pull requests…</p>
            ) : null}
            {items.length === 0 && !loadingList ? (
              <p className="text-sm text-slate-400">No pull requests recorded for this project.</p>
            ) : null}
            {items.map((item) => {
              const active = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "w-full rounded-xl border border-slate-800/60 bg-slate-900/60 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-emerald-400/40 hover:bg-slate-900",
                    active && "border-emerald-500/40 bg-slate-900",
                  )}
                >
                  <p className="font-semibold text-slate-100">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatPullRequestStatus(item.status)} • Updated {new Date(item.updatedAt).toLocaleString()}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
        <section className="flex h-full flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Details</p>
              <h2 className="mt-1 text-lg font-semibold text-white">{detail?.title ?? "Select a pull request"}</h2>
              {detail ? (
                <p className="text-xs text-slate-500">
                  Status: {formatPullRequestStatus(detail.status)} • Created {new Date(detail.createdAt).toLocaleString()}
                </p>
              ) : null}
            </div>
            {detail && isActionableStatus(detail.status) ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleStatusChange("open")}
                  className="rounded-lg border border-slate-800/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-emerald-400/40 hover:text-emerald-200"
                  disabled={loadingDetail}
                >
                  Reopen
                </button>
                <button
                  type="button"
                  onClick={() => void handleStatusChange("merged")}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
                  disabled={loadingDetail}
                >
                  Mark merged
                </button>
              </div>
            ) : null}
          </header>
          {loadingDetail ? (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
          {detail ? (
            <>
              <article className="rounded-xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Summary</p>
                <p className="mt-2 whitespace-pre-wrap text-slate-200">{detail.description ?? "No description provided."}</p>
              </article>
              <div className="flex-1 overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/60">
                <header className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                  <span>Conversation</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                    <MessageSquare className="h-3 w-3" /> {conversation.length}
                  </span>
                </header>
                <div className="flex h-64 flex-col gap-2 overflow-y-auto px-4 py-3 text-sm">
                  {conversation.length === 0 ? (
                    <p className="text-xs text-slate-500">No conversation history yet.</p>
                  ) : (
                    conversation.map((message) => (
                      <article key={message.id} className="rounded-lg border border-slate-800/50 bg-slate-950/70 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{message.role}</p>
                        <p className="mt-1 whitespace-pre-wrap text-slate-200">{message.content}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-slate-500">
                          {message.createdAt ? new Date(message.createdAt).toLocaleString() : "Just now"}
                        </p>
                      </article>
                    ))
                  )}
                </div>
                <form onSubmit={handleSendMessage} className="border-t border-slate-800/60 p-3">
                  <label htmlFor="pr-reply" className="sr-only">
                    Reply to pull request
                  </label>
                  <div className="flex items-center gap-2">
                    <textarea
                      id="pr-reply"
                      value={draft.content}
                      onChange={(event) => setDraft({ content: event.target.value, sending: false })}
                      className="h-16 flex-1 resize-none rounded-lg border border-slate-800/70 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      placeholder="Share feedback or next steps…"
                      disabled={draft.sending}
                    />
                    <button
                      type="submit"
                      disabled={draft.sending || !draft.content.trim()}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {draft.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                      Send
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              Select a pull request to view details.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

