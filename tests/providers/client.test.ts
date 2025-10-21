import { describe, expect, it } from "vitest";

import { createClient } from "@/providers/client";

describe("createClient", () => {
  it("constructs client with provided configuration", () => {
    class FakeClient {
      config: unknown;
      constructor(config: unknown) {
        this.config = config;
      }
    }

    const client = createClient(
      "https://example.dev",
      "secret-key",
      FakeClient as unknown as typeof FakeClient,
    ) as unknown as FakeClient;

    expect(client).toBeInstanceOf(FakeClient);
    expect(client.config).toEqual({ apiUrl: "https://example.dev", apiKey: "secret-key" });
  });
});
