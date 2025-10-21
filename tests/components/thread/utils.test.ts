// @vitest-environment node
import { describe, expect, it } from "vitest";

import { getContentString } from "@/components/thread/utils";

describe("getContentString", () => {
  it("returns raw strings unchanged", () => {
    expect(getContentString("Hello world" as never)).toBe("Hello world");
  });

  it("joins multiple text blocks with spaces", () => {
    const content = [
      { type: "text", text: "Hello" },
      { type: "text", text: "world" },
      { type: "text", text: "!" },
    ];

    expect(getContentString(content as never)).toBe("Hello world !");
  });

  it("returns an empty string for empty multimodal arrays", () => {
    expect(getContentString([] as never)).toBe("");
  });
});
