import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(`${process.cwd()}/vitest.config.ts`);
const { build } = require("esbuild");

const originalWindow = typeof window === "undefined" ? undefined : window;
const createStubWindow = () =>
  ({
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
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

describe("useMediaQuery", () => {
  it("initializes from matchMedia.matches", async () => {
    const { reactMock, createContext } = createHookEnvironment();
    const { useMediaQuery } = await compileHook<{
      useMediaQuery: (query: string) => boolean;
    }>(
      "src/hooks/useMediaQuery.tsx",
      { react: reactMock },
    );

    const listeners: ((event: MediaQueryListEvent) => void)[] = [];
    const stubWindow = createStubWindow();
    stubWindow.matchMedia = () => ({
      matches: true,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.push(listener);
      },
      removeEventListener: () => {},
    });

    await withWindow(stubWindow, async () => {
      const ctx = createContext(useMediaQuery);
      ctx.render("(min-width: 768px)");
      ctx.render();

      expect(ctx.result).toBe(true);

      ctx.unmount();
    });

    expect(listeners.length).toBe(1);
  });

  it("updates when the media query changes", async () => {
    const { reactMock, createContext } = createHookEnvironment();
    const { useMediaQuery } = await compileHook<{
      useMediaQuery: (query: string) => boolean;
    }>(
      "src/hooks/useMediaQuery.tsx",
      { react: reactMock },
    );

    const stubWindow = createStubWindow();
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    const mediaObject = {
      matches: false,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        changeListener = listener;
      },
      removeEventListener: () => {},
    };
    stubWindow.matchMedia = () => mediaObject as MediaQueryList;

    await withWindow(stubWindow, async () => {
      const ctx = createContext(useMediaQuery);
      ctx.render("(min-width: 768px)");

      expect(ctx.result).toBe(false);
      if (!changeListener) throw new Error("Listener not registered");

      changeListener({ matches: true } as MediaQueryListEvent);
      ctx.render();

      expect(ctx.result).toBe(true);

      ctx.unmount();
    });
  });

  it("cleans up listeners on unmount", async () => {
    const { reactMock, createContext } = createHookEnvironment();
    const { useMediaQuery } = await compileHook<{
      useMediaQuery: (query: string) => boolean;
    }>(
      "src/hooks/useMediaQuery.tsx",
      { react: reactMock },
    );

    const stubWindow = createStubWindow();
    let registeredListener: ((event: MediaQueryListEvent) => void) | undefined;
    const removeListener = vi.fn();
    stubWindow.matchMedia = () => ({
      matches: false,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        registeredListener = listener;
      },
      removeEventListener: removeListener,
    });

    await withWindow(stubWindow, async () => {
      const ctx = createContext(useMediaQuery);
      ctx.render("(min-width: 768px)");
      ctx.unmount();
    });

    expect(removeListener.mock.calls.length).toBe(1);
    const [eventType, listener] = removeListener.mock.calls[0];
    expect(eventType).toBe("change");
    expect(listener).toBe(registeredListener);
  });
});
