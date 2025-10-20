import { describe, expect, it } from "vitest";

import { isBase64ContentBlock } from "@/lib/multimodal-utils";

describe("isBase64ContentBlock", () => {
  it("accepts legacy file blocks", () => {
    const block = {
      type: "file",
      source_type: "base64",
      mime_type: "application/pdf",
      data: "ZGF0YQ==",
    };

    expect(isBase64ContentBlock(block)).toBe(true);
  });

  it("accepts image base64 blocks", () => {
    const block = {
      type: "image",
      source_type: "base64",
      mime_type: "image/png",
      data: "ZGF0YQ==",
    };

    expect(isBase64ContentBlock(block)).toBe(true);
  });

  it("rejects non-base64 sources", () => {
    const block = {
      type: "image",
      source_type: "url",
      mime_type: "image/png",
      url: "https://example.com/image.png",
    };

    expect(isBase64ContentBlock(block)).toBe(false);
  });

  it("rejects unrelated input", () => {
    expect(isBase64ContentBlock(null)).toBe(false);
    expect(isBase64ContentBlock({})).toBe(false);
  });
});
