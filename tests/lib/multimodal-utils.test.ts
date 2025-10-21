import { describe, expect, it } from "vitest";

import { createFileToContentBlock, isBase64ContentBlock } from "@/lib/multimodal-utils";
import { toast } from "sonner";

describe("fileToContentBlock", () => {
  it("creates base64 image blocks", async () => {
    const reader = async () => "ZmFrZS1pbWFnZQ==";
    const toBlock = createFileToContentBlock(reader);
    const block = await toBlock({
      name: "sample.png",
      type: "image/png",
    } as File);

    expect(block).toEqual({
      type: "image",
      source_type: "base64",
      mime_type: "image/png",
      data: "ZmFrZS1pbWFnZQ==",
      metadata: { name: "sample.png" },
    });
  });

  it("creates base64 pdf blocks", async () => {
    const reader = async () => "cGRmLWRhdGE=";
    const toBlock = createFileToContentBlock(reader);
    const block = await toBlock({
      name: "spec.pdf",
      type: "application/pdf",
    } as File);

    expect(block).toEqual({
      type: "file",
      source_type: "base64",
      mime_type: "application/pdf",
      data: "cGRmLWRhdGE=",
      metadata: { filename: "spec.pdf" },
    });
  });

  it("rejects unsupported files and records toast", async () => {
    const reader = async () => "ignored";
    const toBlock = createFileToContentBlock(reader);
    await expect(
      toBlock({ name: "notes.txt", type: "text/plain" } as File),
    ).rejects.toThrow(/Unsupported file type: text\/plain/);

    expect(toast.calls[0]).toEqual({
      type: "error",
      args: [
        "Unsupported file type: text/plain. Supported types are: image/jpeg, image/png, image/gif, image/webp, application/pdf",
      ],
    });
  });
});

describe("isBase64ContentBlock", () => {
  it("detects image blocks", () => {
    expect(
      isBase64ContentBlock({
        type: "image",
        source_type: "base64",
        mime_type: "image/png",
      }),
    ).toBe(true);
  });

  it("detects pdf blocks", () => {
    expect(
      isBase64ContentBlock({
        type: "file",
        source_type: "base64",
        mime_type: "application/pdf",
      }),
    ).toBe(true);
  });

  it("rejects other blocks", () => {
    expect(
      isBase64ContentBlock({ type: "custom", source_type: "raw" }),
    ).toBe(false);
  });
});
