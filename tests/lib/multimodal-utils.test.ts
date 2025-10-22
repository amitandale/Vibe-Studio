// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fileToContentBlock, isBase64ContentBlock } from "@/lib/multimodal-utils";
import { toast } from "sonner";

const originalToastError = toast.error;
const originalFileReader = globalThis.FileReader;

class StubFileReader {
  onloadend: null | (() => void) = null;
  onerror: null | (() => void) = null;
  result: string | null = null;

  readAsDataURL(file: File) {
    this.result = `data:${file.type};base64,${btoa(file.name)}`;
    if (this.onloadend) {
      this.onloadend();
    }
  }
}

beforeEach(() => {
  toast.error = vi.fn();
  // @ts-expect-error - assign stub
  globalThis.FileReader = StubFileReader;
});

afterEach(() => {
  toast.error = originalToastError;
  if (originalFileReader) {
    globalThis.FileReader = originalFileReader;
  } else {
    // @ts-expect-error - cleanup for tests
    delete globalThis.FileReader;
  }
});

describe("multimodal utils", () => {
  it("identifies base64 image blocks", () => {
    const block = {
      type: "image",
      source_type: "base64",
      mime_type: "image/png",
      data: "ZGF0YQ==",
    };

    expect(isBase64ContentBlock(block)).toBe(true);
    expect(
      isBase64ContentBlock({
        type: "image",
        source_type: "url",
        mime_type: "image/png",
        url: "https://example.com/image.png",
      }),
    ).toBe(false);
  });

  it("creates content blocks for supported files", async () => {
    const file = new File(["test"], "photo.png", { type: "image/png" });

    const block = await fileToContentBlock(file);

    expect(block).toEqual({
      type: "image",
      source_type: "base64",
      mime_type: "image/png",
      data: btoa("photo.png"),
      metadata: { name: "photo.png" },
    });
  });

  it("rejects unsupported files and emits a toast", async () => {
    const file = new File(["oops"], "note.txt", { type: "text/plain" });
    let error: unknown;

    try {
      await fileToContentBlock(file);
    } catch (err) {
      error = err;
    }

    expect((error as Error).message).toBe("Unsupported file type: text/plain");

    const mockInfo = toast.error as unknown as { mock: { calls: unknown[][] } };
    expect(mockInfo.mock.calls.length).toBe(1);
  });
});
