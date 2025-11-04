"use client";

import React from "react";
import { BusinessLogicSelect, type BusinessLogicOption } from "@/components/BusinessLogicSelect";

interface LogicStepProps {
  options: BusinessLogicOption[];
  selectedOptionId: string | null;
  onSelectOption: (optionId: string) => void;
  onPreviewOption: (option: BusinessLogicOption) => void;
  disabled?: boolean;
  rationale?: string | null;
}

export function LogicStep({
  options,
  selectedOptionId,
  onSelectOption,
  onPreviewOption,
  disabled = false,
  rationale,
}: LogicStepProps): React.ReactNode {
  return (
    <div className="space-y-4">
      <header>
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/90">Step 4</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Business logic templates</h2>
        <p className="mt-1 text-sm text-slate-400">
          Select the orchestration plan that best captures your workflows. The onboarding assistant will generate the
          code skeleton for the selected option.
        </p>
      </header>
      <BusinessLogicSelect
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

