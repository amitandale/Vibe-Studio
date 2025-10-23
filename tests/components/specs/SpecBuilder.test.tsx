import { describe, it, expect } from "vitest";
import { buildRunRequest, INITIAL_FORM_STATE, type SpecFormState } from "@/components/specs/SpecBuilder";

describe("SpecBuilder request composition", () => {
  it("generates a run payload from form state", () => {
    const form: SpecFormState = {
      ...INITIAL_FORM_STATE,
      name: "Repo triage",
      summary: "Classify incoming PRs",
      instructions: "Return a JSON blob summarising risks.",
      temperature: 0.35,
      goal: "Surface risky pull requests",
      context: "monorepo",
      selectedTools: ["fs.read", "git.status"],
    };

    const payload = buildRunRequest(form);

    expect(payload.spec.name).toBe("Repo triage");
    expect(payload.spec.summary).toBe("Classify incoming PRs");
    expect(payload.spec.instructions).toBe("Return a JSON blob summarising risks.");
    expect(payload.spec.config?.temperature).toBe(0.35);
    expect(payload.input?.goal).toBe("Surface risky pull requests");
    expect(payload.input?.context).toBe("monorepo");
    expect(payload.spec.tools).toEqual(["fs.read", "git.status"]);
    expect(payload.metadata?.source).toBe("vibe-studio");
  });
});
