import type { ChangeEvent } from "react";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(`${process.cwd()}/vitest.config.ts`);
const { build } = require("esbuild");

const createStubWindow = () =>
  ({
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as Window & typeof globalThis;

async function withWindow<T>(
  stub: Window & typeof globalThis,
  run: () => Promise<T> | T,
): Promise<T> {
  const hadWindow = typeof (globalThis as any).window !== "undefined";
  const previousWindow = hadWindow
    ? ((globalThis as any).window as Window & typeof globalThis)
    : undefined;
  (globalThis as any).window = stub;
  try {
    return await run();
  } finally {
    if (hadWindow && previousWindow) {
      (globalThis as any).window = previousWindow;
    } else {
      delete (globalThis as any).window;
    }
  }
}

interface EffectRecord {
  deps: any[] | null;
  cleanup?: () => void;
}

interface HookContext<TArgs extends unknown[], TResult> {
  hook: (...args: TArgs) => TResult;
  args: TArgs;
  result: TResult;
  states: any[];
  effects: (EffectRecord | undefined)[];
  refs: any[];
  stateIndex: number;
  effectIndex: number;
  refIndex: number;
  render: (...args: TArgs) => void;
  unmount: () => void;
}

let currentContext: HookContext<any, any> | null = null;

function createHookEnvironment() {
  const reactMock = {
    useState(initial: unknown) {
      if (!currentContext) throw new Error("useState outside context");
      const ctx = currentContext;
      const index = ctx.stateIndex++;
      if (ctx.states.length <= index) {
        ctx.states.push(
          typeof initial === "function" ? (initial as () => unknown)() : initial,
        );
      }
      const setState = (value: unknown) => {
        ctx.states[index] =
          typeof value === "function"
            ? (value as (current: unknown) => unknown)(ctx.states[index])
            : value;
      };
      return [ctx.states[index], setState] as const;
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      if (!currentContext) throw new Error("useEffect outside context");
      const ctx = currentContext;
      const index = ctx.effectIndex++;
      const prev = ctx.effects[index];
      const depsArray = deps ? [...deps] : null;
      const depsChanged =
        !prev ||
        prev.deps === null ||
        depsArray === null ||
        prev.deps.length !== depsArray.length ||
        prev.deps.some((dep, i) => dep !== depsArray[i]);
      if (depsChanged) {
        if (prev && prev.cleanup) {
          prev.cleanup();
        }
        const cleanup = effect() || undefined;
        ctx.effects[index] = { deps: depsArray, cleanup };
      } else {
        ctx.effects[index] = prev;
      }
    },
    useRef(initial: unknown) {
      if (!currentContext) throw new Error("useRef outside context");
      const ctx = currentContext;
      const index = ctx.refIndex++;
      if (ctx.refs.length <= index) {
        ctx.refs.push({ current: initial });
      }
      return ctx.refs[index];
    },
  };

  function createContext<TArgs extends unknown[], TResult>(
    hook: (...args: TArgs) => TResult,
  ): HookContext<TArgs, TResult> {
    const ctx: HookContext<TArgs, TResult> = {
      hook,
      args: [] as unknown as TArgs,
      result: undefined as unknown as TResult,
      states: [],
      effects: [],
      refs: [],
      stateIndex: 0,
      effectIndex: 0,
      refIndex: 0,
      render: (...args: TArgs) => {
        ctx.args = args.length ? args : ctx.args;
        ctx.stateIndex = 0;
        ctx.effectIndex = 0;
        ctx.refIndex = 0;
        currentContext = ctx;
        ctx.result = hook(...ctx.args);
        currentContext = null;
        for (let i = ctx.effectIndex; i < ctx.effects.length; i += 1) {
          const eff = ctx.effects[i];
          if (eff && eff.cleanup) eff.cleanup();
        }
        ctx.effects.length = ctx.effectIndex;
      },
      unmount: () => {
        ctx.effects.forEach((eff) => {
          if (eff && eff.cleanup) eff.cleanup();
        });
        ctx.effects = [];
      },
    };
    return ctx;
  }

  return { reactMock, createContext };
}

async function compileHook<TExports>(
  entryPath: string,
  mocks: Record<string, unknown>,
): Promise<TExports> {
  (globalThis as any).__hookTestMocks = mocks;
  const result = await build({
    entryPoints: [resolve(entryPath)],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    target: "es2019",
    plugins: [
      {
        name: "hook-test-mocks",
        setup(build) {
          build.onResolve({ filter: /^@\// }, (args) => {
            if (args.path in mocks) {
              return { path: args.path, namespace: "hook-mock" };
            }
            const base = resolve("src", args.path.slice(2));
            const candidates = ["", ".ts", ".tsx", ".js", ".jsx"];
            for (const ext of candidates) {
              const fullPath = ext ? `${base}${ext}` : base;
              if (existsSync(fullPath)) {
                return { path: fullPath };
              }
            }
            return { path: base };
          });
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.path in mocks) {
              return { path: args.path, namespace: "hook-mock" };
            }
            return null;
          });
          build.onLoad({ filter: /.*/, namespace: "hook-mock" }, (args) => ({
            contents: `module.exports = globalThis.__hookTestMocks["${args.path}"];`,
            loader: "js",
          }));
        },
      },
    ],
  });
  const code = result.outputFiles[0].text;
  const module = { exports: {} as TExports };
  const fn = new Function("module", "exports", code);
  fn(module, module.exports);
  delete (globalThis as any).__hookTestMocks;
  return module.exports;
}

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

const originalFileReader = globalThis.FileReader;

beforeEach(() => {
  // @ts-expect-error - assign stub
  globalThis.FileReader = StubFileReader;
});

afterEach(() => {
  if (originalFileReader) {
    globalThis.FileReader = originalFileReader;
  } else {
    // @ts-expect-error - cleanup for tests
    delete globalThis.FileReader;
  }
});

describe("useFileUpload", () => {
  async function setup() {
    const { reactMock, createContext } = createHookEnvironment();
    const toastMock = { error: vi.fn() };
    const fileToContentBlockMock = vi.fn(async (file: File) => ({
      type: file.type === "application/pdf" ? "file" : "image",
      source_type: "base64",
      mime_type: file.type,
      data: btoa(file.name),
      metadata:
        file.type === "application/pdf"
          ? { filename: file.name }
          : { name: file.name },
    }));

    const { useFileUpload } = await compileHook<{
      useFileUpload: (options?: { initialBlocks?: any[] }) => any;
    }>("src/hooks/use-file-upload.tsx", {
      react: reactMock,
      sonner: { toast: toastMock },
      "@/lib/multimodal-utils": { fileToContentBlock: fileToContentBlockMock },
    });

    return { useFileUpload, createContext, toastMock, fileToContentBlockMock };
  }

  it("accepts supported mime types and rejects others", async () => {
    const { useFileUpload, createContext, toastMock } = await setup();
    const stubWindow = createStubWindow();
    stubWindow.addEventListener = vi.fn();
    stubWindow.removeEventListener = vi.fn();

    await withWindow(stubWindow, async () => {
      const ctx = createContext(useFileUpload);
      ctx.render();

      const validFile = new File(["content"], "photo.png", { type: "image/png" });
      const invalidFile = new File(["oops"], "notes.txt", { type: "text/plain" });
      const event = {
        target: {
          files: [validFile, invalidFile],
          value: "placeholder",
        },
      } as ChangeEvent<HTMLInputElement>;

      await ctx.result.handleFileUpload(event);
      ctx.render();

      expect(ctx.result.contentBlocks.length).toBe(1);
      expect(ctx.result.contentBlocks[0].metadata?.name).toBe("photo.png");
      expect(event.target.value).toBe("");
      expect(toastMock.error.mock.calls.length).toBe(1);

      ctx.unmount();
    });
  });

  it("deduplicates uploads based on name, size, and type", async () => {
    const { useFileUpload, createContext, toastMock, fileToContentBlockMock } =
      await setup();
    const stubWindow = createStubWindow();

    await withWindow(stubWindow, async () => {
      const existingBlock = {
        type: "image" as const,
        source_type: "base64" as const,
        mime_type: "image/png",
        data: btoa("photo.png"),
        metadata: { name: "photo.png" },
      };

      const ctx = createContext(useFileUpload);
      ctx.render({ initialBlocks: [existingBlock] });

      const duplicateFile = new File(["content"], "photo.png", { type: "image/png" });
      const uniqueFile = new File(["content"], "unique.png", { type: "image/png" });
      const event = {
        target: {
          files: [duplicateFile, uniqueFile],
          value: "placeholder",
        },
      } as ChangeEvent<HTMLInputElement>;

      await ctx.result.handleFileUpload(event);
      ctx.render();

      expect(ctx.result.contentBlocks.map((b: any) => b.metadata?.name)).toEqual([
        "photo.png",
        "unique.png",
      ]);
      expect(toastMock.error.mock.calls.length).toBe(1);
      expect(fileToContentBlockMock.mock.calls.length).toBe(1);

      ctx.unmount();
    });
  });

  it("calls fileToContentBlock for each unique valid file", async () => {
    const { useFileUpload, createContext, fileToContentBlockMock } = await setup();
    const stubWindow = createStubWindow();

    await withWindow(stubWindow, async () => {
      const ctx = createContext(useFileUpload);
      ctx.render();

      const files = [
        new File(["a"], "a.png", { type: "image/png" }),
        new File(["b"], "b.png", { type: "image/png" }),
      ];
      const event = {
        target: {
          files,
          value: "placeholder",
        },
      } as ChangeEvent<HTMLInputElement>;

      await ctx.result.handleFileUpload(event);
      ctx.render();

      expect(fileToContentBlockMock.mock.calls.length).toBe(2);
      expect(ctx.result.contentBlocks.map((b: any) => b.metadata?.name)).toEqual([
        "a.png",
        "b.png",
      ]);

      ctx.unmount();
    });
  });

  it("removes items and clears state", async () => {
    const { useFileUpload, createContext } = await setup();
    const stubWindow = createStubWindow();

    await withWindow(stubWindow, async () => {
      const initialBlocks = [
        {
          type: "image" as const,
          source_type: "base64" as const,
          mime_type: "image/png",
          data: btoa("first.png"),
          metadata: { name: "first.png" },
        },
        {
          type: "image" as const,
          source_type: "base64" as const,
          mime_type: "image/png",
          data: btoa("second.png"),
          metadata: { name: "second.png" },
        },
      ];

      const ctx = createContext(useFileUpload);
      ctx.render({ initialBlocks });

      ctx.result.removeBlock(0);
      ctx.render();

      expect(ctx.result.contentBlocks.length).toBe(1);
      expect(ctx.result.contentBlocks[0].metadata?.name).toBe("second.png");

      ctx.result.resetBlocks();
      ctx.render();

      expect(ctx.result.contentBlocks.length).toBe(0);

      ctx.unmount();
    });
  });
});
