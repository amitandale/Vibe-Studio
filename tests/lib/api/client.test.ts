import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AgentMcpClient } from "@/lib/api/client";
import type { Run } from "@/lib/api/types";

declare const global: typeof globalThis & { fetch: typeof fetch };

describe("AgentMcpClient", () => {
  const baseUrl = "http://localhost:4000";
  let fetchMock: ReturnType<typeof vi.fn>;
  const run: Run = {
    id: "run_123",
    status: "queued",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    spec: { name: "", instructions: "" },
  };

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it("posts to /v1/runs when creating a run", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => run, status: 200 });
    const client = new AgentMcpClient(baseUrl);

    await client.createRun({ spec: { name: "demo", instructions: "" } });

    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/v1/runs`);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init?.method).toBe("POST");
  });

  it("posts to cancel endpoint", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "cancelled" }), status: 200 });
    const client = new AgentMcpClient(baseUrl);

    await client.cancelRun("run_123");

    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/v1/runs/run_123/cancel`);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init?.method).toBe("POST");
  });

  it("fetches the tool catalog", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ name: "fs.read", enabled: true }], status: 200 });
    const client = new AgentMcpClient(baseUrl);

    const tools = await client.listTools();

    expect(tools[0].name).toBe("fs.read");
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/v1/tools`);
  });
});
