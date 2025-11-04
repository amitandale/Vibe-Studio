"use client";

import React from "react";
import { BookOpenCheck, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BusinessLogicOption {
  id: string;
  title: string;
  summary: string;
  estimatedEffort: string;
  previewMarkdown?: string;
}

interface BusinessLogicSelectProps {
  options: BusinessLogicOption[];
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  onPreview: (option: BusinessLogicOption) => void;
  disabled?: boolean;
}

export function BusinessLogicSelect({
  options,
  selectedOptionId,
  onSelect,
  onPreview,
  disabled = false,
}: BusinessLogicSelectProps): React.ReactNode {
  if (options.length === 0) {
    return (
      <p className="rounded-xl border border-slate-800/70 bg-slate-950/70 p-4 text-sm text-slate-400">
        No business logic templates available. Ask the onboarding assistant to regenerate recommendations.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {options.map((option) => {
        const active = option.id === selectedOptionId;
        return (
          <article
            key={option.id}
            className={cn(
              "flex h-full flex-col justify-between rounded-2xl border border-slate-800/70 bg-slate-950/70 p-5 transition hover:border-emerald-500/30 hover:bg-slate-950",
              active && "border-emerald-500/40",
            )}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-emerald-300" />
                <h3 className="text-lg font-semibold text-white">{option.title}</h3>
              </div>
              <p className="text-sm text-slate-300">{option.summary}</p>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Effort {option.estimatedEffort}</p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-slate-800/60 pt-4">
              <button
                type="button"
                onClick={() => onPreview(option)}
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 underline-offset-4 transition hover:text-slate-200 hover:underline"
              >
                <BookOpenCheck className="h-3.5 w-3.5" /> Preview
              </button>
              <button
                type="button"
                onClick={() => onSelect(option.id)}
                disabled={disabled}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                    : "border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-600 hover:text-slate-100",
                )}
              >
                {active ? "Selected" : "Use plan"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

