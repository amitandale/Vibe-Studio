import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    toast.error.calls = [];
  });

  it("accepts supported files while rejecting invalid ones", async () => {
    const transformFile = vi.fn(async (file: File) => ({
      type: "image" as const,
      source_type: "base64" as const,
      mime_type: file.type,
      data: `${file.name}-data`,
      metadata: { name: file.name },
    }));

    const { result } = renderHook(() =>
      useFileUpload({ transformFile }),
    );
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

    expect(transformFile.mock.calls.length).toBe(1);
    expect(transformFile.mock.calls[0][0]).toBe(validFile);
    expect(toast.error.calls.length).toBe(1);
    expect(result.current.contentBlocks.length).toBe(1);
    expect(event.target.value).toBe("");
  });

  it("deduplicates files based on name, size, and type", async () => {
    const transformFile = vi.fn(async (file: File) => ({
      type: "image" as const,
      source_type: "base64" as const,
      mime_type: file.type,
      data: `${file.name}-data`,
      metadata: { name: file.name },
    }));

    const { result } = renderHook(() =>
      useFileUpload({ transformFile }),
    );
    const file = new File(["content"], "photo.png", { type: "image/png" });

    const event = {
      target: {
        files: toFileList([file]),
        value: "initial",
      },
    } as unknown as ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleFileUpload(event);
    });

    expect(result.current.contentBlocks.length).toBe(1);
    expect(toast.error.calls.length).toBe(0);

    transformFile.mock.calls = [];
    toast.error.calls = [];

    await act(async () => {
      await result.current.handleFileUpload({
        target: {
          files: toFileList([file]),
          value: "initial",
        },
      } as unknown as ChangeEvent<HTMLInputElement>);
    });

    expect(transformFile.mock.calls.length).toBe(0);
    expect(toast.error.calls.length).toBe(1);
    expect(result.current.contentBlocks.length).toBe(1);
  });

  it("appends content blocks for each unique valid file", async () => {
    const transformFile = vi.fn(async (file: File) => {
      if (file.type === "application/pdf") {
        return {
          type: "file" as const,
          source_type: "base64" as const,
          mime_type: file.type,
          data: `${file.name}-data`,
          metadata: { filename: file.name },
        };
      }
      return {
        type: "image" as const,
        source_type: "base64" as const,
        mime_type: file.type,
        data: `${file.name}-data`,
        metadata: { name: file.name },
      };
    });

    const { result } = renderHook(() =>
      useFileUpload({ transformFile }),
    );
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

    expect(transformFile.mock.calls.length).toBe(2);
    expect(result.current.contentBlocks).toEqual([
      {
        type: "image",
        source_type: "base64",
        mime_type: "image/png",
        data: "photo.png-data",
        metadata: { name: "photo.png" },
      },
      {
        type: "file",
        source_type: "base64",
        mime_type: "application/pdf",
        data: "document.pdf-data",
        metadata: { filename: "document.pdf" },
      },
    ]);
  });

  it("supports removing specific blocks and clearing all state", async () => {
    const transformFile = vi.fn(async (file: File) => ({
      type: "image" as const,
      source_type: "base64" as const,
      mime_type: file.type,
      data: `${file.name}-data`,
      metadata: { name: file.name },
    }));

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
        transformFile,
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
