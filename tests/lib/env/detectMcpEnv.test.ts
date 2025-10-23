import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectMcpEnvironment } from "@/lib/env/detectMcpEnv";

declare const global: typeof globalThis & { fetch: typeof fetch };

describe("detectMcpEnvironment", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  let windowBackup: unknown;

  beforeEach(() => {
    process.env = { ...originalEnv };
    windowBackup = global.window;
    // @ts-expect-error jsdom assignment for tests
    global.window = { location: { origin: "http://localhost:3000" } };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    // @ts-expect-error restore
    global.window = windowBackup;
  });

  it("marks status ONLINE when /health succeeds", async () => {
    process.env.NEXT_PUBLIC_MCP_BASE_URL = "http://127.0.0.1:4000/";
    global.fetch = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

    const snapshot = await detectMcpEnvironment();

    expect(snapshot.status).toBe("ONLINE");
    expect(snapshot.baseUrl).toBe("http://127.0.0.1:4000");
  });

  it("marks status DEGRADED when /health fails", async () => {
    process.env.NEXT_PUBLIC_MCP_BASE_URL = "http://127.0.0.1:4000";
    global.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;

    const snapshot = await detectMcpEnvironment();

    expect(snapshot.status).toBe("DEGRADED");
    expect(snapshot.reason).toBe("Unexpected status: 503");
  });

  it("marks status OFFLINE when no base url detected", async () => {
    delete process.env.NEXT_PUBLIC_MCP_BASE_URL;
    // @ts-expect-error simulate missing window
    global.window = undefined;
    const snapshot = await detectMcpEnvironment();
    expect(snapshot.status).toBe("OFFLINE");
    expect(snapshot.baseUrl).toBe(null);
  });
});
