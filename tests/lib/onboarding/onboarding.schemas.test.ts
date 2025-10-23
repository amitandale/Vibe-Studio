import { describe, expect, it } from "vitest";
import { onboardingEventSchema, stackRecommendationSchema } from "@/lib/onboarding/schemas";

describe("onboarding schemas", () => {
  it("parses valid stack recommendation", () => {
    const recommendation = stackRecommendationSchema.parse({
      id: "stack-a",
      pros: ["fast"],
      cons: [],
      risks: [],
      opsNotes: ["monitor logs"],
      fit_score: 0.75,
    });
    expect(recommendation.id).toBe("stack-a");
  });

  it("rejects invalid fit score", () => {
    let threw = false;
    try {
      stackRecommendationSchema.parse({ id: "stack-a", pros: [], cons: [], risks: [], opsNotes: [], fit_score: 1.2 });
    } catch (error) {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("parses SSE events", () => {
    const event = onboardingEventSchema.parse({
      type: "STACKS_RECOMMENDED",
      seq: 2,
      ts: new Date().toISOString(),
      items: [
        { id: "stack-a", pros: [], cons: [], risks: [], opsNotes: [], fit_score: 0.5 },
      ],
    });
    expect(event.type).toBe("STACKS_RECOMMENDED");
  });
});
