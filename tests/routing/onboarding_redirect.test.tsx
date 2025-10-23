import { describe, expect, it } from "vitest";
import { shouldRedirectToOnboarding } from "@/lib/onboarding/state";

describe("onboarding redirect helper", () => {
  it("requires onboarding when manifest missing", () => {
    expect(shouldRedirectToOnboarding(null)).toBe(true);
  });

  it("bypasses onboarding when locked", () => {
    expect(
      shouldRedirectToOnboarding({
        projectId: "demo",
        status: "Locked",
        updatedAt: new Date().toISOString(),
        templates: { items: [], lockDigest: "sha", lockedAt: new Date().toISOString() },
      }),
    ).toBe(false);
  });
});
