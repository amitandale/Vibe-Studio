import { describe, expect, it } from "vitest";

import { createPassthroughHandlers } from "@/app/api/[..._path]/route";

describe("createPassthroughHandlers", () => {
  it("passes env values to initializer", () => {
    const captured: unknown[] = [];
    const initializer = (config: unknown) => {
      captured.push(config);
      return {
        GET: async () => undefined,
        POST: async () => undefined,
        PUT: async () => undefined,
        PATCH: async () => undefined,
        DELETE: async () => undefined,
        OPTIONS: async () => undefined,
        runtime: "edge" as const,
      };
    };

    const env = {
      LANGGRAPH_API_URL: "https://example.dev/graphql",
      LANGSMITH_API_KEY: "example-key",
    } as NodeJS.ProcessEnv;

    const result = createPassthroughHandlers(initializer, env);

    expect(result.runtime).toBe("edge");
    expect(captured).toEqual([
      {
        apiUrl: "https://example.dev/graphql",
        apiKey: "example-key",
        runtime: "edge",
      },
    ]);
  });

  it("falls back to default placeholders when env unset", () => {
    const configs: unknown[] = [];
    const initializer = (config: unknown) => {
      configs.push(config);
      return {
        GET: async () => undefined,
        POST: async () => undefined,
        PUT: async () => undefined,
        PATCH: async () => undefined,
        DELETE: async () => undefined,
        OPTIONS: async () => undefined,
        runtime: "edge" as const,
      };
    };

    createPassthroughHandlers(initializer, {} as NodeJS.ProcessEnv);

    expect(configs[0]).toEqual({
      apiUrl: "remove-me",
      apiKey: "remove-me",
      runtime: "edge",
    });
  });
});
