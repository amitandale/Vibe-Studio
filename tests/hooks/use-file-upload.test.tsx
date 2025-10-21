import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { useFileUpload } from "@/hooks/use-file-upload";
import { toast } from "sonner";

const toFileList = (files: File[]): FileList => {
  const fileList: Partial<FileList> = {
    length: files.length,
    item(index: number) {
      return files[index] ?? null;
    },
  };

  files.forEach((file, index) => {
    (fileList as Record<number, File>)[index] = file;
  });

  return fileList as FileList;
};

describe("useFileUpload", () => {
  beforeEach(() => {
    (toast.error as { calls?: unknown[][] }).calls = [];
  });

  it("accepts supported files while rejecting invalid ones", async () => {
    const { result } = renderHook(() => useFileUpload());
    const validFile = new File(["content"], "photo.png", { type: "image/png" });
    const invalidFileA = new File(["content"], "notes.txt", { type: "text/plain" });
    const invalidFileB = new File(["content"], "audio.mp3", { type: "audio/mpeg" });

    const event = {
      target: {
        files: toFileList([validFile, invalidFileA, invalidFileB]),
        value: "placeholder",
      },
    } as unknown as ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileUpload(event);
    });

    expect(((toast.error as { calls?: unknown[][] }).calls ?? []).length).toBe(1);
    expect(result.current.contentBlocks.length).toBe(1);
    const block = result.current.contentBlocks[0];
    expect(block.type).toBe("image");
    expect((block as { mime_type?: string }).mime_type).toBe("image/png");
    expect((block as { metadata?: { name?: string } }).metadata?.name).toBe(
      "photo.png",
    );
    expect(event.target.value).toBe("");
  });

  it("deduplicates files based on name, size, and type", async () => {
    const { result } = renderHook(() => useFileUpload());
    const file = new File(["content"], "photo.png", { type: "image/png" });

    await act(async () => {
      await result.current.handleFileUpload({
        target: {
          files: toFileList([file]),
          value: "initial",
        },
      } as unknown as ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.contentBlocks.length).toBe(1);
    expect(((toast.error as { calls?: unknown[][] }).calls ?? []).length).toBe(0);

    (toast.error as { calls?: unknown[][] }).calls = [];

    await act(async () => {
      await result.current.handleFileUpload({
        target: {
          files: toFileList([file]),
          value: "initial",
        },
      } as unknown as ChangeEvent<HTMLInputElement>);
    });

    expect(((toast.error as { calls?: unknown[][] }).calls ?? []).length).toBe(1);
    expect(result.current.contentBlocks.length).toBe(1);
  });

  it("appends content blocks for each unique valid file", async () => {
    const { result } = renderHook(() => useFileUpload());
    const files = [
      new File(["a"], "photo.png", { type: "image/png" }),
      new File(["b"], "document.pdf", { type: "application/pdf" }),
    ];

    await act(async () => {
      await result.current.handleFileUpload({
        target: {
          files: toFileList(files),
          value: "",
        },
      } as unknown as ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.contentBlocks.length).toBe(2);
    const [imageBlock, pdfBlock] = result.current.contentBlocks;
    expect(imageBlock.type).toBe("image");
    expect((imageBlock as { metadata?: { name?: string } }).metadata?.name).toBe(
      "photo.png",
    );
    expect(pdfBlock.type).toBe("file");
    expect((pdfBlock as { metadata?: { filename?: string } }).metadata?.filename).toBe(
      "document.pdf",
    );
  });

  it("supports removing specific blocks and clearing all state", async () => {
    const { result } = renderHook(() =>
      useFileUpload({
        initialBlocks: [
          {
            type: "image",
            source_type: "base64",
            mime_type: "image/png",
            data: "existing",
            metadata: { name: "existing.png" },
          },
        ],
      }),
    );

    expect(result.current.contentBlocks.length).toBe(1);

    await act(async () => {
      result.current.removeBlock(0);
    });
    expect(result.current.contentBlocks.length).toBe(0);

    await act(async () => {
      const file = new File(["a"], "photo.png", { type: "image/png" });
      await result.current.handleFileUpload({
        target: {
          files: toFileList([file]),
          value: "",
        },
      } as unknown as ChangeEvent<HTMLInputElement>);
      result.current.resetBlocks();
    });

    expect(result.current.contentBlocks.length).toBe(0);
  });
});
