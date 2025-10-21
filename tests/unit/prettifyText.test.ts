import { describe, expect, it } from "vitest";

import { prettifyText } from "@/components/thread/agent-inbox/utils";

describe("prettifyText", () => {
  it("converts snake_case to start case", () => {
    expect(prettifyText("example_action")).toBe("Example Action");
  });

  it("leaves already spaced words capitalized", () => {
    expect(prettifyText("already pretty")).toBe("Already Pretty");
  });
});
