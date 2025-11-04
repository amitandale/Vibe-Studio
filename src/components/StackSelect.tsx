"use client";

import React from "react";
import { CheckCircle2, Info, Lightbulb, ShieldAlert } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { StackRecommendation } from "@/lib/onboarding/schemas";
import { cn } from "@/lib/utils";

export interface StackSelectProps {
  recommendations: StackRecommendation[];
  selectedStackId: string | null;
  onSelect: (stackId: string) => void;
  onPreview: (stackId: string) => void;
  disabled?: boolean;
}

export function StackSelect({
  recommendations,
  selectedStackId,
  onSelect,
  onPreview,
  disabled = false,
}: StackSelectProps): React.ReactNode {
  const items = React.useMemo(() => recommendations.filter((stack) => stack.fit_score >= 0.4), [recommendations]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-6 text-sm text-slate-300">
        <p>No stacks available yet. Confirm your specs to request a fresh recommendation run.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((stack) => {
        const active = stack.id === selectedStackId;
        return (
          <article
            key={stack.id}
            className={cn(
              "group flex h-full flex-col justify-between rounded-2xl border border-slate-800/70 bg-slate-950/70 p-5 transition hover:border-emerald-500/30 hover:bg-slate-950",
              active && "border-emerald-500/40",
            )}
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">{stack.id}</h3>
                  <p className="mt-1 text-sm text-emerald-200">Fit score: {(stack.fit_score * 100).toFixed(0)}%</p>
                </div>
                {active ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Selected
                  </span>
                ) : null}
              </div>
              {renderList("Pros", stack.pros, "text-emerald-200", <Lightbulb className="h-4 w-4" />)}
              {renderList("Cons", stack.cons, "text-rose-200", <ShieldAlert className="h-4 w-4" />)}
              {renderList("Ops Notes", stack.opsNotes, "text-slate-200", <Info className="h-4 w-4" />)}
              {stack.expectedCosts ? (
                <p className="text-sm text-slate-400">
                  <span className="font-medium text-slate-200">Expected cost:</span> {stack.expectedCosts}
                </p>
              ) : null}
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-slate-800/60 pt-4">
              <Tooltip.Provider delayDuration={150}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      type="button"
                      onClick={() => onPreview(stack.id)}
                      className="text-xs font-semibold uppercase tracking-wide text-slate-400 underline-offset-4 transition hover:text-slate-200 hover:underline"
                    >
                      Preview rationale
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="max-w-xs rounded-lg border border-slate-800/70 bg-slate-950/90 p-3 text-xs text-slate-200 shadow">
                    {stack.rationale ?? "Advisor rationale is unavailable."}
                    <Tooltip.Arrow className="fill-slate-800/70" />
                  </Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
              <button
                type="button"
                onClick={() => onSelect(stack.id)}
                disabled={disabled}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-70"
              >
                {active ? "Reselect" : "Select"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function renderList(label: string, items: string[] | undefined, accentClass: string, icon: React.ReactNode): React.ReactNode {
  if (!items || items.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <p className={cn("flex items-center gap-2 text-sm font-semibold", accentClass)}>
        {icon}
        {label}
      </p>
      <ul className="space-y-1 text-sm text-slate-300">
        {items.map((item, index) => (
          <li key={`${label}-${index}`} className="flex gap-2">
            <span aria-hidden className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-600" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

