"use client";

import React from "react";
import { MonitorSmartphone, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UiTemplateOption {
  id: string;
  name: string;
  summary: string;
  previewImageUrl?: string;
  accessibilityNotes?: string;
}

interface UIUXSelectProps {
  options: UiTemplateOption[];
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  onPreview: (optionId: string) => void;
  disabled?: boolean;
}

export function UIUXSelect({
  options,
  selectedOptionId,
  onSelect,
  onPreview,
  disabled = false,
}: UIUXSelectProps): React.ReactNode {
  if (options.length === 0) {
    return (
      <p className="rounded-xl border border-slate-800/70 bg-slate-950/70 p-4 text-sm text-slate-400">
        No UI templates available. The onboarding assistant can source options from the template registry.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => {
        const active = option.id === selectedOptionId;
        return (
          <article
            key={option.id}
            className={cn(
              "flex h-full flex-col justify-between rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 transition hover:border-emerald-500/30 hover:bg-slate-950",
              active && "border-emerald-500/40",
            )}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="h-4 w-4 text-emerald-300" />
                <h3 className="text-base font-semibold text-white">{option.name}</h3>
              </div>
              <p className="text-sm text-slate-300">{option.summary}</p>
              {option.accessibilityNotes ? (
                <p className="text-xs text-slate-400">Accessibility: {option.accessibilityNotes}</p>
              ) : null}
              {option.previewImageUrl ? (
                <div className="overflow-hidden rounded-lg border border-slate-800/70">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={option.previewImageUrl} alt={option.name} className="h-36 w-full object-cover" />
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-800/60 pt-3">
              <button
                type="button"
                onClick={() => onPreview(option.id)}
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 underline-offset-4 transition hover:text-slate-200 hover:underline"
              >
                <Palette className="h-3.5 w-3.5" /> Preview
              </button>
              <button
                type="button"
                onClick={() => onSelect(option.id)}
                disabled={disabled}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                  active
                    ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                    : "border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-600 hover:text-slate-100",
                )}
              >
                {active ? "Selected" : "Use template"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

