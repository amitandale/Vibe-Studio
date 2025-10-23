"use client";

import { CheckCircle2, Info, Lightbulb, ShieldAlert } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import React from "react";
import type { StackRecommendation } from "@/lib/onboarding/schemas";

interface StacksPickerProps {
  stacks: StackRecommendation[];
  onSelect: (stackId: string) => void;
  onBack: () => void;
  selectedStackId: string | null;
  disabled?: boolean;
  rationaleLoader?: (stackId: string) => void;
}

export const STACK_FIT_SCORE_FLOOR = 0.4;

export function filterStacksByFitScore(stacks: StackRecommendation[]): StackRecommendation[] {
  return stacks.filter((stack) => stack.fit_score >= STACK_FIT_SCORE_FLOOR);
}

export function StacksPicker({
  stacks,
  onSelect,
  onBack,
  selectedStackId,
  disabled = false,
}: StacksPickerProps): React.ReactNode {
  const visibleStacks = React.useMemo(() => filterStacksByFitScore(stacks), [stacks]);

  if (visibleStacks.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-6 text-sm text-slate-300">
        <p>No recommended stacks available yet. Confirm your system requirements to request suggestions.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
        >
          Return to Specs
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/90">Step 2</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Select a Stack</h2>
          <p className="mt-2 text-sm text-slate-400">
            Each recommendation includes pros, cons, operational considerations, and cost notes. Choosing a stack locks your specs from further edits.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
        >
          Back to Specs
        </button>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {visibleStacks.map((stack) => {
          const active = stack.id === selectedStackId;
          return (
            <article
              key={stack.id}
              className="group flex h-full flex-col justify-between rounded-2xl border border-slate-800/70 bg-slate-950/70 p-5 transition hover:border-emerald-500/30 hover:bg-slate-950"
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
                        className="text-xs font-semibold uppercase tracking-wide text-slate-400 underline-offset-4 transition hover:text-slate-200 hover:underline"
                      >
                        Why this pick?
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
    </div>
  );
}

function renderList(
  label: string,
  items: string[] | undefined,
  accentClass: string,
  icon: React.ReactNode,
): React.ReactNode {
  if (!items || items.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <p className={`flex items-center gap-2 text-sm font-semibold ${accentClass}`}>
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
