import { describe, expect, it } from "vitest";
import React from "react";

import { GitHubSVG } from "@/components/icons/github";
import { LangGraphLogoSVG } from "@/components/icons/langgraph";

(globalThis as any).React = React;

describe("icons", () => {
  it("renders github icon", () => {
    const element = GitHubSVG({} as any);
    expect(element.type).toBe("svg");
  });

  it("renders langgraph logo", () => {
    const element = LangGraphLogoSVG({} as any);
    expect(element.type).toBe("svg");
  });
});
