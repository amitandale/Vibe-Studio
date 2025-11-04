"use client";

import React from "react";
import { CheckCircle2, ClipboardCopy } from "lucide-react";
import type { StackRecommendation, TemplateDescriptor } from "@/lib/onboarding/schemas";
import type { BusinessLogicOption } from "@/components/BusinessLogicSelect";
import type { UiTemplateOption } from "@/components/UIUXSelect";

interface SummaryStepProps {
  selectedStack: StackRecommendation | null;
  lockedTemplates: TemplateDescriptor[];
  logicOption: BusinessLogicOption | null;
  uiOption: UiTemplateOption | null;
  onCopySummary?: () => void;
}

export function SummaryStep({ selectedStack, lockedTemplates, logicOption, uiOption, onCopySummary }: SummaryStepProps) {
  const summary = React.useMemo(() => {
    const lines: string[] = [];
    if (selectedStack) {
      lines.push(`Stack: ${selectedStack.id}`);
    }
    if (lockedTemplates.length > 0) {
      lines.push("Templates:");
      for (const template of lockedTemplates) {
        lines.push(`- ${template.id} (${template.digest})`);
      }
    }
    if (logicOption) {
      lines.push(`Business logic: ${logicOption.title}`);
    }
    if (uiOption) {
      lines.push(`UI template: ${uiOption.name}`);
    }
    return lines.join("\n");
  }, [lockedTemplates, logicOption, selectedStack, uiOption]);

  const handleCopy = React.useCallback(() => {
    void navigator.clipboard?.writeText(summary);
    onCopySummary?.();
  }, [onCopySummary, summary]);

  return (
    <div className="space-y-4">
      <header>
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/90">Step 6</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Onboarding complete</h2>
        <p className="mt-1 text-sm text-slate-400">
          Review your selections and copy the summary for audit logs. You can revisit onboarding to reset if necessary.
        </p>
      </header>
      <section className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-sm text-emerald-100">
        <div className="flex items-center gap-2 text-emerald-200">
          <CheckCircle2 className="h-5 w-5" />
          <span>Onboarding requirements satisfied.</span>
        </div>
        <dl className="grid gap-3 md:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">Stack</dt>
            <dd className="mt-1 text-sm">{selectedStack ? selectedStack.id : "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">Business logic</dt>
            <dd className="mt-1 text-sm">{logicOption ? logicOption.title : "Not selected"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">UI template</dt>
            <dd className="mt-1 text-sm">{uiOption ? uiOption.name : "Not selected"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">Templates locked</dt>
            <dd className="mt-1 text-sm">{lockedTemplates.length}</dd>
          </div>
        </dl>
      </section>
      <section className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 text-sm text-slate-200">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Summary</p>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-slate-300">{summary}</pre>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-emerald-400/40 hover:text-emerald-200"
        >
          <ClipboardCopy className="h-4 w-4" /> Copy summary
        </button>
      </section>
    </div>
  );
}

