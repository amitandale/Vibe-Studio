// @vitest-environment node
import { describe, expect, it } from "vitest";

import { getContentString } from "@/components/thread/utils";

describe("getContentString", () => {
  it("returns plain string content", () => {
    expect(getContentString("hello" as any)).toBe("hello");
  });

  it("joins text blocks with spacing", () => {
    expect(
      getContentString([
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ] as any),
    ).toBe("hello world");
  });

  it("falls back for empty multimodal arrays", () => {
    expect(getContentString([] as any)).toBe("Multimodal message");
  });
});
