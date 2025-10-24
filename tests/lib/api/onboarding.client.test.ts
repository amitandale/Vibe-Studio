import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingClient } from "@/lib/api/onboarding.client";
import { AgentMcpClient } from "@/lib/api/client";
import type { OnboardingEvent } from "@/lib/onboarding/schemas";

const originalFetchArtifact = AgentMcpClient.prototype.fetchArtifact;
const originalStreamRun = AgentMcpClient.prototype.streamRun;

const fetchArtifactMock = vi.fn();
const streamRunMock = vi.fn();

describe("OnboardingClient", () => {
  beforeEach(() => {
    fetchArtifactMock.mockReset();
    streamRunMock.mockReset();
    AgentMcpClient.prototype.fetchArtifact = fetchArtifactMock as unknown as typeof originalFetchArtifact;
    AgentMcpClient.prototype.streamRun = streamRunMock as unknown as typeof originalStreamRun;
  });

  afterEach(() => {
    AgentMcpClient.prototype.fetchArtifact = originalFetchArtifact;
    AgentMcpClient.prototype.streamRun = originalStreamRun;
  });

  it("fetches manifest", async () => {
    fetchArtifactMock.mockResolvedValue({ content: { projectId: "demo", status: "NotStarted", updatedAt: new Date().toISOString() } });
    const client = new OnboardingClient("https://mcp", "demo");
    const manifest = await client.fetchManifest("trace-a");
    expect(manifest?.projectId === "demo").toBe(true);
    const call = fetchArtifactMock.mock.calls[0];
    expect(call[0]).toBe("onboarding/manifest.json");
    expect((call[1] as Record<string, unknown>).traceId).toBe("trace-a");
  });

  it("streams events", () => {
    const unsubscribe = vi.fn();
    streamRunMock.mockImplementation((_id: string, options: { onEvent: (payload: unknown) => void }) => {
      const payload: OnboardingEvent = { type: "STACK_SELECTED", id: "stack", seq: 1, ts: new Date().toISOString() } as OnboardingEvent;
      options.onEvent({ payload });
      return unsubscribe;
    });
    const client = new OnboardingClient("https://mcp", "demo");
    const handler = vi.fn();
    client.streamRun("run-1", { onEvent: handler }, "trace-b");
    const call = handler.mock.calls[0][0] as OnboardingEvent;
    expect(call.type === "STACK_SELECTED").toBe(true);
  });
});
