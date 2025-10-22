import { describe, expect, it } from "vitest";

import { createClientOptions, createClient } from "@/providers/client";

describe("createClientOptions", () => {
  it("returns the provided url and key", () => {
    const options = createClientOptions("https://api.dev", "abc123");

    expect(options.apiUrl).toBe("https://api.dev");
    expect(options.apiKey).toBe("abc123");
  });
});

describe("createClient", () => {
  it("constructs a client using the derived options", () => {
    const client = createClient("https://api.dev", "abc123");
    expect(typeof (client as any).threads).toBe("object");
  });
});
