import { describe, expect, it } from "vitest";

import { getContentString } from "@/components/thread/utils";

describe("getContentString", () => {
  it("returns string content unchanged", () => {
    expect(getContentString("hello world")).toBe("hello world");
  });

  it("joins text blocks when present", () => {
    expect(
      getContentString([
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ]),
    ).toBe("hello world");
  });

  it("labels first non-text modality", () => {
    expect(
      getContentString([
        { type: "image", data: "ignored", mime_type: "image/png" },
      ] as unknown as Parameters<typeof getContentString>[0]),
    ).toBe("Image");
  });

  it("falls back to Other for unknown non-text modality", () => {
    expect(
      getContentString([
        { type: "custom", value: 123 },
      ] as unknown as Parameters<typeof getContentString>[0]),
    ).toBe("Other");
  });

  it("returns fallback for empty content arrays", () => {
    expect(getContentString([] as unknown as Parameters<typeof getContentString>[0])).toBe(
      "Multimodal message",
    );
  });
});
