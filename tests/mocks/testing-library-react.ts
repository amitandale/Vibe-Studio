const ReactModule = require("react") as {
  __setDispatcher: (dispatcher: Dispatcher | null) => void;
  createElement: typeof import("react")["createElement"];
};

type HookCallback<TValue> = () => TValue;

type HookResult<TValue> = {
  current: TValue;
};

type RenderHookReturn<TValue> = {
  result: HookResult<TValue>;
  rerender: (nextCallback?: HookCallback<TValue>) => void;
  unmount: () => void;
};

type EffectState = {
  deps?: unknown[];
  cleanup?: (() => void) | void;
};

type PendingEffect = {
  index: number;
  effect: () => void | (() => void);
  deps?: unknown[];
};

type Dispatcher = {
  useState<TValue>(
    initial: TValue | (() => TValue),
  ): [TValue, (value: TValue | ((prev: TValue) => TValue)) => void];
  useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  useRef<TValue>(initial: TValue): { current: TValue };
};

const { __setDispatcher } = ReactModule;

const mountedRenderers = new Set<() => void>();

const areHookDepsEqual = (prev?: unknown[], next?: unknown[]) => {
  if (!prev || !next) {
    return false;
  }
  if (prev.length !== next.length) {
    return false;
  }
  return prev.every((value, index) => Object.is(value, next[index]));
};

export function act(callback: () => void | Promise<void>): Promise<void> | void {
  try {
    const result = callback();
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).then(() => undefined);
    }
  } catch (error) {
    return Promise.reject(error);
  }
  return undefined;
}

export function cleanup(): void {
  for (const unmount of mountedRenderers) {
    unmount();
  }
  mountedRenderers.clear();
}

export function renderHook<TValue>(
  callback: HookCallback<TValue>,
): RenderHookReturn<TValue> {
  const stateStore: unknown[] = [];
  const refStore: { current: unknown }[] = [];
  const effectStore: EffectState[] = [];
  const result: HookResult<TValue> = {
    current: undefined as unknown as TValue,
  };

  let currentCallback = callback;
  let isUnmounted = false;

  const runPendingEffects = (effects: PendingEffect[]) => {
    for (const record of effects) {
      const previous = effectStore[record.index];
      if (previous?.cleanup) {
        previous.cleanup();
      }
      const cleanup = record.effect();
      effectStore[record.index] = {
        deps: record.deps,
        cleanup: typeof cleanup === "function" ? cleanup : undefined,
      };
    }
  };

  const render = () => {
    if (isUnmounted) {
      return;
    }

    let hookIndex = 0;
    const pendingEffects: PendingEffect[] = [];

    const dispatcher: Dispatcher = {
      useState<TValue>(initial: TValue | (() => TValue)) {
        const index = hookIndex++;
        if (!(index in stateStore)) {
          stateStore[index] =
            typeof initial === "function" ? (initial as () => TValue)() : initial;
        }
        const setState = (value: TValue | ((prev: TValue) => TValue)) => {
          const previous = stateStore[index] as TValue;
          const next =
            typeof value === "function"
              ? (value as (prev: TValue) => TValue)(previous)
              : value;
          if (!Object.is(previous, next)) {
            stateStore[index] = next;
            render();
          }
        };
        return [stateStore[index] as TValue, setState];
      },
      useEffect(effect: () => void | (() => void), deps?: unknown[]) {
        const index = hookIndex++;
        const previous = effectStore[index];
        const shouldRun =
          !previous || !deps || !previous.deps || !areHookDepsEqual(previous.deps, deps);
        if (shouldRun) {
          pendingEffects.push({ index, effect, deps });
        }
      },
      useRef<TValue>(initial: TValue) {
        const index = hookIndex++;
        if (!(index in refStore)) {
          refStore[index] = { current: initial };
        }
        return refStore[index] as { current: TValue };
      },
    };

    __setDispatcher(dispatcher);
    try {
      result.current = currentCallback();
    } finally {
      __setDispatcher(null);
    }

    runPendingEffects(pendingEffects);
  };

  const unmount = () => {
    if (isUnmounted) {
      return;
    }
    isUnmounted = true;
    for (const record of effectStore) {
      if (record?.cleanup) {
        record.cleanup();
      }
    }
  };

  mountedRenderers.add(unmount);
  render();

  return {
    result,
    rerender: (nextCallback?: HookCallback<TValue>) => {
      if (nextCallback) {
        currentCallback = nextCallback;
      }
      render();
    },
    unmount: () => {
      mountedRenderers.delete(unmount);
      unmount();
    },
  };
}
