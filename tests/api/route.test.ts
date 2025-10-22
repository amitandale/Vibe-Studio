import { describe, expect, it } from "vitest";

import { resolvePassthroughConfig } from "@/app/api/[..._path]/config";

describe("resolvePassthroughConfig", () => {
  it("reads values from environment", () => {
    const config = resolvePassthroughConfig({
      LANGGRAPH_API_URL: "https://example.dev",
      LANGSMITH_API_KEY: "test-key",
    } as NodeJS.ProcessEnv);

    expect(config.apiUrl).toBe("https://example.dev");
    expect(config.apiKey).toBe("test-key");
    expect(config.runtime).toBe("edge");
  });

  it("falls back to remove-me when env is missing", () => {
    const config = resolvePassthroughConfig({} as NodeJS.ProcessEnv);

    expect(config.apiUrl).toBe("remove-me");
    expect(config.apiKey).toBe("remove-me");
  });
});
