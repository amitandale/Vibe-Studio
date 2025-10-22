import { describe, expect, it } from "vitest";

import { checkGraphStatus, sleep } from "@/providers/Stream";

describe("sleep", () => {
  it("resolves after the requested delay", async () => {
    const before = Date.now();
    await sleep(0);
    const after = Date.now();

    expect(after - before >= 0).toBeTruthy();
  });
});

describe("checkGraphStatus", () => {
  it("returns true when the fetch succeeds", async () => {
    const originalFetch = globalThis.fetch;
    let calledUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calledUrl = typeof input === "string" ? input : input.toString();
      return { ok: true } as Response;
    }) as typeof fetch;

    const result = await checkGraphStatus("https://example.dev", "abc123");

    expect(result).toBe(true);
    expect(calledUrl).toBe("https://example.dev/info");

    globalThis.fetch = originalFetch;
  });

  it("returns false when fetch throws", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network");
    }) as typeof fetch;

    const result = await checkGraphStatus("https://example.dev", null);

    expect(result).toBe(false);

    globalThis.fetch = originalFetch;
  });
});
