import { describe, expect, it } from "vitest";
import { filterStacksByFitScore, STACK_FIT_SCORE_FLOOR } from "@/app/onboarding/_components/StacksPicker";
import type { StackRecommendation } from "@/lib/onboarding/schemas";

function createStack(partial: Partial<StackRecommendation> = {}): StackRecommendation {
  return {
    id: partial.id ?? "stack-basic",
    pros: partial.pros ?? [],
    cons: partial.cons ?? [],
    risks: partial.risks ?? [],
    opsNotes: partial.opsNotes ?? [],
    expectedCosts: partial.expectedCosts,
    fit_score: partial.fit_score ?? 0.75,
    rationale: partial.rationale,
  };
}

describe("filterStacksByFitScore", () => {
  it("removes stacks that fall below the minimum fit score", () => {
    const stacks = [
      createStack({ id: "primary", fit_score: STACK_FIT_SCORE_FLOOR }),
      createStack({ id: "secondary", fit_score: STACK_FIT_SCORE_FLOOR - 0.01 }),
    ];

    const result = filterStacksByFitScore(stacks);

    expect(result.map((stack) => stack.id)).toEqual(["primary"]);
  });

  it("returns an empty list when all stacks are below the floor", () => {
    const stacks = [
      createStack({ id: "a", fit_score: STACK_FIT_SCORE_FLOOR - 0.1 }),
      createStack({ id: "b", fit_score: STACK_FIT_SCORE_FLOOR - 0.2 }),
    ];

    const result = filterStacksByFitScore(stacks);

    expect(result.length).toBe(0);
  });
});
