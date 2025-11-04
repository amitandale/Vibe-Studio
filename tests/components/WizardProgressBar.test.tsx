import { describe, expect, it } from "vitest";
import { resolveStepVisualState } from "@/components/WizardProgressBar";

describe("resolveStepVisualState", () => {
  it("marks the active step", () => {
    const { container, badge, title } = resolveStepVisualState("spec", "spec", new Set());
    expect(container.includes("border-emerald-400/50")).toBe(true);
    expect(badge.includes("border-emerald-400")).toBe(true);
    expect(title.includes("text-slate-100")).toBe(true);
  });

  it("marks completed steps", () => {
    const { container } = resolveStepVisualState("tokens", "stack", new Set(["tokens"]));
    expect(container.includes("bg-emerald-950/10")).toBe(true);
  });
});
