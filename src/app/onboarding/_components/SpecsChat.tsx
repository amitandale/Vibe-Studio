"use client";

import { ArrowUpRight, Loader2, MessageCircle, Sparkles, Undo2 } from "lucide-react";
import React from "react";
import { v4 as uuidv4 } from "uuid";
import type { SpecsConfirmationSummary, SpecsDraft } from "@/lib/onboarding/schemas";

export type ChatRole = "system" | "user" | "assistant" | "event";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  rationale?: string | null;
}

interface SpecsChatProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  onAction: (action: "refine" | "suggestion" | "clear" | "confirm") => void;
  disabled?: boolean;
  isStreaming?: boolean;
  draft: SpecsDraft | null;
  confirmation: SpecsConfirmationSummary | null;
}

export function SpecsChat({
  messages,
  onSend,
  onAction,
  disabled = false,
  isStreaming = false,
  draft,
  confirmation,
}: SpecsChatProps): React.ReactNode {
  const [input, setInput] = React.useState("");
  const endRef = React.useRef<HTMLDivElement | null>(null);

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!input.trim()) {
        return;
      }
      onSend(input.trim());
      setInput("");
    },
    [input, onSend],
  );

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-inner shadow-emerald-500/5">
      <div className="flex items-center justify-between pb-4">
        <div>
          <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/90">Specs Assistant</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Project Conversation</h2>
        </div>
        {isStreaming ? (
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Streaming
          </div>
        ) : null}
      </div>
      <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-800/70 bg-slate-950/60">
        <div
          className="onboarding-chat-scroll flex h-full flex-col gap-3 overflow-y-auto p-4 text-sm"
          role="log"
          aria-live="polite"
        >
          {messages.map((message) => (
            <article
              key={message.id}
              className="flex items-start gap-3 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-slate-200"
            >
              <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-md border border-slate-800/60 bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                {getInitial(message.role)}
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  {message.role === "assistant" ? "Advisor" : message.role === "system" ? "Studio" : "You"}
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-600">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-200">{message.content}</p>
              </div>
            </article>
          ))}
          <div ref={endRef} />
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onAction("refine")}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/20"
          disabled={disabled}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Refine
        </button>
        <button
          type="button"
          onClick={() => onAction("suggestion")}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-900/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
          disabled={disabled}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Use Suggestion
        </button>
        <button
          type="button"
          onClick={() => onAction("clear")}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-slate-700 hover:bg-slate-900"
          disabled={disabled}
        >
          <Undo2 className="h-3.5 w-3.5" />
          Clear Section
        </button>
        <button
          type="button"
          onClick={() => onAction("confirm")}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/20"
          disabled={disabled || !draft}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Confirm System Requirements
        </button>
      </div>
      <form onSubmit={handleSubmit} className="mt-3">
        <label htmlFor="specs-chat-input" className="sr-only">
          Send a message to the onboarding assistant
        </label>
        <div className="relative">
          <textarea
            id="specs-chat-input"
            className="h-28 w-full resize-none rounded-xl border border-slate-800/70 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 shadow-inner shadow-emerald-500/5 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Describe product goals, constraints, data sources, auth, and NFRs..."
            disabled={disabled}
          />
          <button
            type="submit"
            className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-70"
            disabled={disabled || !input.trim()}
          >
            Send
          </button>
        </div>
      </form>
      {confirmation ? (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="font-rajdhani text-[11px] uppercase tracking-[0.4em] text-emerald-300/80">Confirmation Ready</p>
          <p className="mt-1 text-sm text-emerald-100">
            Chapters prepared: {confirmation.chapters.join(", ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function getInitial(role: ChatRole): string {
  switch (role) {
    case "assistant":
      return "A";
    case "system":
      return "S";
    case "event":
      return "E";
    default:
      return "U";
  }
}

export function createSystemMessage(content: string): ChatMessage {
  return {
    id: uuidv4(),
    role: "system",
    content,
    timestamp: Date.now(),
  };
}
