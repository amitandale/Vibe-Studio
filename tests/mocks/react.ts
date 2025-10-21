export type ChangeEvent<T = any> = {
  target: T;
};

export type MutableRefObject<T> = {
  current: T;
};

type StateUpdater<T> = (value: T | ((prev: T) => T)) => void;

type EffectRecord = {
  effect: () => void | (() => void);
  deps?: unknown[];
  cleanup?: () => void;
};

type Dispatcher = {
  useState<T>(initial: T | (() => T)): [T, StateUpdater<T>];
  useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  useRef<T>(initial: T): MutableRefObject<T>;
};

let currentDispatcher: Dispatcher | null = null;

export const __setDispatcher = (dispatcher: Dispatcher | null) => {
  currentDispatcher = dispatcher;
};

const ensureDispatcher = () => {
  if (!currentDispatcher) {
    throw new Error("Hooks can only be used within renderHook");
  }
  return currentDispatcher;
};

export function useState<T>(initial: T | (() => T)) {
  return ensureDispatcher().useState(initial);
}

export function useEffect(effect: () => void | (() => void), deps?: unknown[]) {
  ensureDispatcher().useEffect(effect, deps);
}

export function useRef<T>(initial: T): MutableRefObject<T> {
  return ensureDispatcher().useRef(initial);
}

export function createElement(type: unknown, props: unknown, ...children: unknown[]) {
  return { type, props: { ...props, children } };
}

const React = {
  createElement,
  useState,
  useEffect,
  useRef,
};

export default React;
