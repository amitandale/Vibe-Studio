"use client";

import { FileCode2, Lock, Sparkles } from "lucide-react";
import React from "react";
import type { TemplateDescriptor } from "@/lib/onboarding/schemas";

interface TemplatesPickerProps {
  templates: TemplateDescriptor[];
  selected: Record<string, boolean>;
  onToggle: (templateId: string) => void;
  onSelectAll: () => void;
  onLock: () => void;
  locking?: boolean;
  disabled?: boolean;
  stackId: string | null;
  lockDigest?: string | null;
  lockDisabled?: boolean;
}

export function TemplatesPicker({
  templates,
  selected,
  onToggle,
  onSelectAll,
  onLock,
  locking = false,
  disabled = false,
  stackId,
  lockDigest,
  lockDisabled = false,
}: TemplatesPickerProps): React.ReactNode {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/90">Step 3</p>
        <h2 className="text-2xl font-semibold text-white">Lock Base Templates</h2>
        <p className="text-sm text-slate-400">
          Templates must include a digest and source reference. Locking creates an immutable <code className="rounded bg-slate-900 px-1 py-0.5 text-xs text-slate-200">templates.lock.json</code> for project <span className="font-medium text-slate-200">{stackId ?? "(stack pending)"}</span>.
        </p>
      </header>
      <div className="flex items-center justify-between rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
        <div>
          <p className="text-sm font-medium text-slate-200">Select all templates</p>
          <p className="text-xs text-slate-500">Applies to API, DB, UI, and CI skeletons for the chosen stack.</p>
        </div>
        <button
          type="button"
          onClick={onSelectAll}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
          disabled={disabled}
        >
          <Sparkles className="h-4 w-4" />
          Select All
        </button>
      </div>
      <div className="space-y-3">
        {templates.map((template) => {
          const isSelected = selected[template.id] ?? false;
          return (
            <details
              key={template.id}
              className="group rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4">
                <div className="flex flex-1 items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800/70 bg-slate-900/70 text-slate-200">
                    <FileCode2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-white">{template.id}</p>
                    <p className="text-xs text-slate-400">Digest: {template.digest}</p>
                    {template.summary ? <p className="text-xs text-slate-400">{template.summary}</p> : null}
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                    checked={isSelected}
                    onChange={() => onToggle(template.id)}
                    disabled={disabled}
                  />
                  Include
                </label>
              </summary>
              <div className="mt-3 space-y-2 border-t border-slate-800/60 pt-3 text-sm text-slate-300">
                <p><span className="text-slate-200">Source:</span> {template.source ?? "gh://unknown"}</p>
                <p className="text-xs text-slate-500">Ensure compatibility notes are reviewed before locking.</p>
              </div>
            </details>
          );
        })}
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
        {lockDigest ? (
          <p className="text-xs text-emerald-200">Current lock digest: {lockDigest}</p>
        ) : null}
        <button
          type="button"
          onClick={onLock}
          disabled={disabled || locking || lockDisabled}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-70"
        >
          <Lock className="h-4 w-4" />
          {locking ? "Locking Templates..." : "Lock Templates"}
        </button>
      </div>
    </div>
  );
}
