import { describe, expect, it } from "vitest";
import { OnboardingStateMachine } from "@/lib/onboarding/state";
import type { OnboardingEvent } from "@/lib/onboarding/schemas";

const baseManifest = {
  projectId: "demo",
  status: "NotStarted" as const,
  updatedAt: new Date().toISOString(),
};

describe("OnboardingStateMachine", () => {
  it("initialises with manifest data", () => {
    const machine = new OnboardingStateMachine({ projectId: "demo", manifest: baseManifest });
    const snapshot = machine.getSnapshot();
    expect(snapshot.status === "NotStarted").toBe(true);
    expect(snapshot.manifest?.projectId === "demo").toBe(true);
  });

  it("advances through statuses with ordered events", () => {
    const machine = new OnboardingStateMachine({ projectId: "demo", manifest: baseManifest });
    const events: OnboardingEvent[] = [
      { type: "SPECS_DRAFT_UPDATED", draft: { chapter: "Goals" }, seq: 1, ts: new Date().toISOString() },
      { type: "SPECS_CONFIRMATION_READY", summary: { chapters: ["Goals", "Scope"] }, seq: 2, ts: new Date().toISOString() },
      {
        type: "STACKS_RECOMMENDED",
        seq: 3,
        ts: new Date().toISOString(),
        items: [
          { id: "stack-a", pros: ["fast"], cons: [], risks: [], opsNotes: [], fit_score: 0.9 },
        ],
      },
      { type: "STACK_SELECTED", id: "stack-a", seq: 4, ts: new Date().toISOString() },
      {
        type: "TEMPLATES_LISTED",
        items: [
          { id: "api", digest: "sha256:1", source: "gh://a" },
          { id: "db", digest: "sha256:2", source: "gh://b" },
        ],
        seq: 5,
        ts: new Date().toISOString(),
      },
      {
        type: "TEMPLATES_LOCKED",
        lock_artifact_id: "art-1",
        lock_digest: "sha256:lock",
        seq: 6,
        ts: new Date().toISOString(),
      },
    ];

    for (const event of events) {
      machine.applyEvent(event);
    }

    const snapshot = machine.getSnapshot();
    expect(snapshot.status === "Locked").toBe(true);
    expect(snapshot.selectedStackId === "stack-a").toBe(true);
    expect(snapshot.templates.length).toBe(2);
    expect(snapshot.lockDigest === "sha256:lock").toBe(true);
    expect(snapshot.manifest?.status === "Locked").toBe(true);
  });

  it("tracks sequence violations and ignores out-of-order events", () => {
    const machine = new OnboardingStateMachine({ projectId: "demo" });
    machine.applyEvent({ type: "SPECS_DRAFT_UPDATED", draft: {}, seq: 2, ts: new Date().toISOString() });
    machine.applyEvent({ type: "SPECS_DRAFT_UPDATED", draft: {}, seq: 1, ts: new Date().toISOString() });
    const snapshot = machine.getSnapshot();
    expect(snapshot.violations.length).toBe(1);
    expect(snapshot.lastSeq).toBe(2);
  });

  it("resets to initial state", () => {
    const machine = new OnboardingStateMachine({ projectId: "demo", manifest: { ...baseManifest, status: "StackSelected" } });
    machine.reset();
    const snapshot = machine.getSnapshot();
    expect(snapshot.status === "NotStarted").toBe(true);
    expect(snapshot.manifest === null).toBe(true);
    expect(snapshot.templates.length).toBe(0);
  });
});
