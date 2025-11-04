import { describe, expect, it } from "vitest";
import React from "react";

import { MissingProjectId, ProjectMismatch } from "@/app/onboarding/_components/Fallbacks";
import { normalizeBaseUrl, parseBoolean, resolveOnboardingPageState } from "@/app/onboarding/page.state";

function createEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides } as NodeJS.ProcessEnv;
}

describe("onboarding page state helpers", () => {
  it("parses boolean flags with sensible defaults", () => {
    expect(parseBoolean(undefined, true)).toBe(true);
    expect(parseBoolean("OFF", true)).toBe(false);
    expect(parseBoolean("1", false)).toBe(true);
  });

  it("normalizes base URLs by trimming trailing slashes", () => {
    expect(normalizeBaseUrl(undefined)).toBe(null);
    expect(normalizeBaseUrl("https://api.example.com/")).toBe("https://api.example.com");
  });

  it("flags a missing project when neither env nor query provide one", () => {
    const state = resolveOnboardingPageState(undefined, createEnv());
    expect(state.kind).toBe("missingProject");
  });

  it("detects mismatched project ids", () => {
    const state = resolveOnboardingPageState(
      { project_id: "from-query" },
      createEnv({ NEXT_PUBLIC_PROJECT_ID: "from-env" }),
    );
    expect(state.kind).toBe("mismatch");
    if (state.kind === "mismatch") {
      expect(state.expected).toBe("from-env");
      expect(state.received).toBe("from-query");
    }
  });

  it("requires a base url before enabling the wizard", () => {
    const state = resolveOnboardingPageState({ project_id: "demo" }, createEnv());
    expect(state.kind).toBe("missingBaseUrl");
  });

  it("returns the wizard state when configuration is complete", () => {
    const state = resolveOnboardingPageState(
      { project_id: "demo" },
      createEnv({
        NEXT_PUBLIC_MCP_BASE_URL: "https://api.example.com/",
        NEXT_PUBLIC_ONBOARDING_ENABLED: "false",
        NEXT_PUBLIC_ONBOARDING_RESET_ALLOWED: "1",
      }),
    );
    expect(state.kind).toBe("wizard");
    if (state.kind === "wizard") {
      expect(state.baseUrl).toBe("https://api.example.com");
      expect(state.projectId).toBe("demo");
      expect(state.onboardingEnabled).toBe(false);
      expect(state.allowReset).toBe(true);
    }
  });
});

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    return extractText(element.props.children ?? "");
  }
  return "";
}

describe("onboarding fallback components", () => {
  it("communicates the missing project requirement", () => {
    const text = extractText(MissingProjectId());
    expect(text.includes("Project ID required")).toBe(true);
  });

  it("shows the mismatch message with both identifiers", () => {
    const text = extractText(ProjectMismatch({ expected: "expected-id", received: "received-id" }));
    expect(text.includes("expected-id")).toBe(true);
    expect(text.includes("received-id")).toBe(true);
  });
});

