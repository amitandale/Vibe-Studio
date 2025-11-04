"use client";

import React from "react";
import { UIUXSelect, type UiTemplateOption } from "@/components/UIUXSelect";

interface UIStepProps {
  options: UiTemplateOption[];
  selectedOptionId: string | null;
  onSelectOption: (optionId: string) => void;
  onPreviewOption: (optionId: string) => void;
  disabled?: boolean;
  rationale?: string | null;
}

export function UIStep({
  options,
  selectedOptionId,
  onSelectOption,
  onPreviewOption,
  disabled = false,
  rationale,
}: UIStepProps): React.ReactNode {
  return (
    <div className="space-y-4">
      <header>
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/90">Step 5</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">UI &amp; UX templates</h2>
        <p className="mt-1 text-sm text-slate-400">
          Choose the presentation template for your generated application. Previews include accessibility callouts and
          responsive breakpoints.
        </p>
      </header>
      <UIUXSelect
        options={options}
        selectedOptionId={selectedOptionId}
        onSelect={onSelectOption}
        onPreview={onPreviewOption}
        disabled={disabled}
      />
      {rationale ? <p className="text-xs text-slate-500">{rationale}</p> : null}
    </div>
  );
}

