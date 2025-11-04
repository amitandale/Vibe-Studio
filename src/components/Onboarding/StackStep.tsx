"use client";

import React from "react";
import type { StackRecommendation, TemplateDescriptor } from "@/lib/onboarding/schemas";
import { StackSelect } from "@/components/StackSelect";
import { TemplateSelect } from "@/components/TemplateSelect";

interface StackStepProps {
  stacks: StackRecommendation[];
  selectedStackId: string | null;
  onSelectStack: (stackId: string) => void;
  onPreviewStack: (stackId: string) => void;
  templates: TemplateDescriptor[];
  selectedTemplateIds: string[];
  onToggleTemplate: (templateId: string) => void;
  onPreviewTemplate: (templateId: string) => void;
  onLockTemplates: () => void;
  disabled?: boolean;
  lockDisabled?: boolean;
}

export function StackStep({
  stacks,
  selectedStackId,
  onSelectStack,
  onPreviewStack,
  templates,
  selectedTemplateIds,
  onToggleTemplate,
  onPreviewTemplate,
  onLockTemplates,
  disabled = false,
  lockDisabled = false,
}: StackStepProps): React.ReactNode {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <header>
          <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/90">Step 3</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Select stack &amp; lock templates</h2>
          <p className="mt-1 text-sm text-slate-400">
            Choose the recommended stack, preview rationale, and lock templates to generate an immutable configuration.
          </p>
        </header>
        <StackSelect
          recommendations={stacks}
          selectedStackId={selectedStackId}
          onSelect={onSelectStack}
          onPreview={onPreviewStack}
          disabled={disabled}
        />
      </section>
      <section className="space-y-3">
        <header>
          <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/90">Templates</p>
          <p className="mt-1 text-sm text-slate-400">
            Toggle templates to include in <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">templates.lock.json</code>.
          </p>
        </header>
        <TemplateSelect
          templates={templates}
          selectedIds={selectedTemplateIds}
          onToggle={onToggleTemplate}
          onPreview={onPreviewTemplate}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onLockTemplates}
          disabled={disabled || lockDisabled}
          className="inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Lock selected templates
        </button>
      </section>
    </div>
  );
}

