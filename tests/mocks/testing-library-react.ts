import type { MutableRefObject } from "./react";
import { __setDispatcher } from "./react";

type HookCallback<TResult> = () => TResult;

type HookResult<TResult> = {
  current: TResult;
};

type RenderHookResult<TResult> = {
  result: HookResult<TResult>;
  rerender: (callback?: HookCallback<TResult>) => void;
  unmount: () => void;
};

type StateUpdater<T> = (value: T | ((prev: T) => T)) => void;

type Dispatcher = {
  useState<T>(initial: T | (() => T)): [T, StateUpdater<T>];
  useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  useRef<T>(initial: T): MutableRefObject<T>;
};

type EffectRecord = {
  effect: () => void | (() => void);
  deps?: unknown[];
  cleanup?: () => void;
  pending: boolean;
};

type Renderer<TResult> = {
  run: () => void;
  flushEffects: () => void;
  cleanup: () => void;
};

let activeRenderer: Renderer<unknown> | null = null;

const isDepsChanged = (prev?: unknown[], next?: unknown[]) => {
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i += 1) {
    if (!Object.is(prev[i], next[i])) {
      return true;
    }
  }
  return false;
};

export const act = async (callback: () => void | Promise<void>) => {
  await callback();
  activeRenderer?.flushEffects();
};

export const cleanup = () => {
  activeRenderer?.cleanup();
  activeRenderer = null;
};

export function renderHook<TResult>(
  callback: HookCallback<TResult>,
): RenderHookResult<TResult> {
  const stateValues: unknown[] = [];
  const refs: MutableRefObject<unknown>[] = [];
  const effects: EffectRecord[] = [];
  let pendingEffectIndexes = new Set<number>();
  let hookCallback = callback;

  const result: HookResult<TResult> = {
    current: undefined as unknown as TResult,
  };

  const dispatcher: Dispatcher = {
    useState<T>(initial: T | (() => T)) {
      const index = stateValues.length;
      if (stateCursor >= stateValues.length) {
        stateValues.push(
          typeof initial === "function"
            ? (initial as () => T)()
            : initial,
        );
      }
      const currentIndex = stateCursor;
      const setState: StateUpdater<T> = (value) => {
        const nextValue =
          typeof value === "function"
            ? (value as (prev: T) => T)(stateValues[currentIndex] as T)
            : value;
        if (!Object.is(stateValues[currentIndex], nextValue)) {
          stateValues[currentIndex] = nextValue;
          renderer.run();
          renderer.flushEffects();
        }
      };
      const value = stateValues[stateCursor] as T;
      stateCursor += 1;
      return [value, setState];
    },
    useEffect(effect, deps) {
      const index = effectCursor;
      const prev = effects[index];
      const record: EffectRecord = {
        effect,
        deps,
        cleanup: prev?.cleanup,
        pending: prev ? isDepsChanged(prev.deps, deps) : true,
      };
      effects[index] = record;
      if (record.pending) {
        pendingEffectIndexes.add(index);
      }
      effectCursor += 1;
    },
    useRef<T>(initial: T) {
      if (refCursor >= refs.length) {
        refs.push({ current: initial });
      }
      const value = refs[refCursor] as MutableRefObject<T>;
      refCursor += 1;
      return value;
    },
  };

  let stateCursor = 0;
  let effectCursor = 0;
  let refCursor = 0;

  const runHook = () => {
    stateCursor = 0;
    effectCursor = 0;
    refCursor = 0;
    __setDispatcher(dispatcher);
    result.current = hookCallback();
    __setDispatcher(null);
  };

  const flushEffects = () => {
    const indexes = Array.from(pendingEffectIndexes);
    pendingEffectIndexes = new Set();
    indexes.forEach((index) => {
      const record = effects[index];
      if (!record) return;
      record.cleanup?.();
      const cleanup = record.effect();
      record.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      record.pending = false;
    });
  };

  const cleanupEffects = () => {
    effects.forEach((record) => {
      record.cleanup?.();
      record.cleanup = undefined;
      record.pending = false;
    });
  };

  const renderer: Renderer<TResult> = {
    run: () => {
      activeRenderer = renderer as Renderer<unknown>;
      runHook();
    },
    flushEffects: () => {
      flushEffects();
    },
    cleanup: () => {
      cleanupEffects();
      activeRenderer = null;
    },
  };

  renderer.run();
  renderer.flushEffects();

  return {
    result,
    rerender(nextCallback?: HookCallback<TResult>) {
      if (nextCallback) {
        hookCallback = nextCallback;
      }
      renderer.run();
      renderer.flushEffects();
    },
    unmount() {
      renderer.cleanup();
    },
  };
}
