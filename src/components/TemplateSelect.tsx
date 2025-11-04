"use client";

import React from "react";
import { Eye, Lock } from "lucide-react";
import type { TemplateDescriptor } from "@/lib/onboarding/schemas";
import { cn } from "@/lib/utils";

export interface TemplateSelectProps {
  templates: TemplateDescriptor[];
  selectedIds: string[];
  onToggle: (templateId: string) => void;
  onPreview: (templateId: string) => void;
  disabled?: boolean;
}

export function TemplateSelect({
  templates,
  selectedIds,
  onToggle,
  onPreview,
  disabled = false,
}: TemplateSelectProps): React.ReactNode {
  if (templates.length === 0) {
    return (
      <p className="rounded-lg border border-slate-800/70 bg-slate-950/70 p-4 text-sm text-slate-400">
        Templates will appear after a stack has been selected.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {templates.map((template) => {
        const active = selectedIds.includes(template.id);
        return (
          <li
            key={template.id}
            className={cn(
              "flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 transition hover:border-emerald-400/30",
              active && "border-emerald-500/40",
            )}
          >
            <div>
              <p className="font-semibold text-white">{template.id}</p>
              {template.summary ? <p className="text-xs text-slate-400">{template.summary}</p> : null}
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-600">Digest {template.digest}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPreview(template.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
              <button
                type="button"
                onClick={() => onToggle(template.id)}
                disabled={disabled}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] transition",
                  active
                    ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                    : "border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-600 hover:text-slate-100",
                )}
              >
                <Lock className="h-3.5 w-3.5" />
                {active ? "Locked" : "Lock"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

