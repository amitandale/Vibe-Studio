"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface WizardStepConfig {
  id: string;
  title: string;
  description?: string;
}

interface WizardProgressBarProps {
  steps: ReadonlyArray<WizardStepConfig>;
  activeStepId: string;
  completedStepIds?: string[];
  className?: string;
}

export function resolveStepVisualState(stepId: string, activeStepId: string, completed: Set<string>) {
  const isActive = stepId === activeStepId;
  const isCompleted = completed.has(stepId);
  return {
    container: cn(
      "flex-1 rounded-lg border border-slate-800/70 bg-slate-950/70 px-4 py-3 transition",
      isActive && "border-emerald-400/50 bg-slate-950/90 text-slate-100",
      !isActive && isCompleted && "border-emerald-500/40 bg-emerald-950/10 text-emerald-200",
    ),
    badge: cn(
      "inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
      isActive ? "border-emerald-400 text-emerald-200" : "border-slate-700 text-slate-400",
    ),
    title: cn("font-semibold", isActive ? "text-slate-100" : "text-slate-300"),
  };
}

export function WizardProgressBar({
  steps,
  activeStepId,
  completedStepIds = [],
  className,
}: WizardProgressBarProps): React.ReactNode {
  const completed = React.useMemo(() => new Set(completedStepIds), [completedStepIds]);

  return (
    <ol className={cn("flex flex-col gap-3 text-sm text-slate-400 md:flex-row", className)}>
      {steps.map((step, index) => {
        const styles = resolveStepVisualState(step.id, activeStepId, completed);
        return (
          <li key={step.id} className={styles.container}>
            <div className="flex items-center gap-3">
              <span className={styles.badge}>{index + 1}</span>
              <div className="flex flex-col">
                <span className={styles.title}>{step.title}</span>
                {step.description ? <span className="text-xs text-slate-500">{step.description}</span> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

