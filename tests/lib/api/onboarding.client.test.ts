import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingClient } from "@/lib/api/onboarding.client";
import { AgentMcpClient } from "@/lib/api/client";
import type { OnboardingEvent } from "@/lib/onboarding/schemas";

const originalFetchArtifact = AgentMcpClient.prototype.fetchArtifact;
const originalStreamTrace = AgentMcpClient.prototype.streamTrace;

const fetchArtifactMock = vi.fn();
const streamTraceMock = vi.fn();

describe("OnboardingClient", () => {
  beforeEach(() => {
    fetchArtifactMock.mockReset();
    streamTraceMock.mockReset();
    AgentMcpClient.prototype.fetchArtifact = fetchArtifactMock as unknown as typeof originalFetchArtifact;
    AgentMcpClient.prototype.streamTrace = streamTraceMock as unknown as typeof originalStreamTrace;
  });

  afterEach(() => {
    AgentMcpClient.prototype.fetchArtifact = originalFetchArtifact;
    AgentMcpClient.prototype.streamTrace = originalStreamTrace;
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
    streamTraceMock.mockImplementation((_trace: string, options: { onEvent: (payload: unknown) => void }) => {
      const payload: OnboardingEvent = { type: "STACK_SELECTED", id: "stack", seq: 1, ts: new Date().toISOString() } as OnboardingEvent;
      options.onEvent(payload);
      return unsubscribe;
    });
    const client = new OnboardingClient("https://mcp", "demo");
    const handler = vi.fn();
    client.streamTrace("trace-b", { onEvent: handler });
    const call = handler.mock.calls[0][0] as OnboardingEvent;
    expect(call.type === "STACK_SELECTED").toBe(true);
  });
});
