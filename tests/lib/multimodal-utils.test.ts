import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  fileToContentBlock,
  isBase64ContentBlock,
} from "@/lib/multimodal-utils";
import { toast } from "sonner";

class FileReaderStub {
  result: string | ArrayBuffer | null = null;
  onloadend: null | (() => void) = null;
  onerror: null | (() => void) = null;

  readAsDataURL(file: File) {
    this.result = `data:${file.type};base64,ZmFrZS1kYXRh`;
    this.onloadend?.();
  }
}

const originalFileReader = globalThis.FileReader;

describe("isBase64ContentBlock", () => {
  it("returns true for base64 image blocks", () => {
    expect(
      isBase64ContentBlock({
        type: "image",
        source_type: "base64",
        mime_type: "image/png",
      }),
    ).toBe(true);
  });

  it("returns false for non-base64 content", () => {
    expect(isBase64ContentBlock({ type: "text", text: "hello" })).toBe(false);
  });
});

describe("fileToContentBlock", () => {
  beforeEach(() => {
    (toast.error as { calls?: unknown[][] }).calls = [];
    globalThis.FileReader = FileReaderStub as unknown as typeof FileReader;
  });

  afterEach(() => {
    globalThis.FileReader = originalFileReader;
  });

  it("converts supported images to base64 content blocks", async () => {
    const file = new File(["fake"], "image.png", { type: "image/png" });
    const block = await fileToContentBlock(file);

    expect(block).toEqual({
      type: "image",
      source_type: "base64",
      mime_type: "image/png",
      data: "ZmFrZS1kYXRh",
      metadata: { name: "image.png" },
    });
  });

  it("converts supported PDFs to base64 content blocks", async () => {
    const file = new File(["fake"], "document.pdf", {
      type: "application/pdf",
    });
    const block = await fileToContentBlock(file);

    expect(block).toEqual({
      type: "file",
      source_type: "base64",
      mime_type: "application/pdf",
      data: "ZmFrZS1kYXRh",
      metadata: { filename: "document.pdf" },
    });
  });

  it("rejects unsupported file types and surfaces a toast", async () => {
    const file = new File(["fake"], "notes.txt", { type: "text/plain" });

    let caught: unknown;
    try {
      await fileToContentBlock(file);
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof Error).toBe(true);
    if (caught instanceof Error) {
      expect(caught.message.includes("Unsupported file type: text/plain"))
        .toBe(true);
    }
    const calls = (toast.error as { calls?: unknown[][] }).calls ?? [];
    expect(calls.length).toBe(1);
  });
});
