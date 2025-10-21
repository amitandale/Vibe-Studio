import { beforeEach, describe, expect, it } from "vitest";

import { getApiKey } from "@/lib/api-key";

const ensureWindow = () => {
  if (typeof window === "undefined" || !window) {
    const storage = (globalThis as { localStorage?: Storage }).localStorage ?? {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    (globalThis as { window?: Window & typeof globalThis }).window = {
      localStorage: storage,
    } as Window & typeof globalThis;
  }
};

const createStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
};

beforeEach(() => {
  const storage = createStorage();
  (globalThis as { window?: Window & typeof globalThis }).window = {
    localStorage: storage,
  } as Window & typeof globalThis;
  (globalThis as { localStorage?: Storage }).localStorage = storage;
});

describe("getApiKey", () => {
  it("returns null when window is undefined (SSR)", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - emulate SSR environment
    globalThis.window = undefined;

    expect(getApiKey()).toBe(null);

    if (originalWindow) {
      globalThis.window = originalWindow;
    } else {
      ensureWindow();
    }
  });

  it("returns the stored key in the browser", () => {
    ensureWindow();
    window.localStorage.setItem("lg:chat:apiKey", "test-key");
    expect(getApiKey()).toBe("test-key");
  });

  it("handles storage exceptions and returns null", () => {
    ensureWindow();
    const originalGetItem = window.localStorage.getItem;
    window.localStorage.setItem("lg:chat:apiKey", "test-key");
    window.localStorage.getItem = () => {
      throw new Error("boom");
    };

    expect(getApiKey()).toBe(null);

    window.localStorage.getItem = originalGetItem;
  });
});
