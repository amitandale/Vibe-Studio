import { describe, expect, it } from "vitest";

import { getApiKey } from "@/lib/api-key";

describe("getApiKey", () => {
  it("returns null when window is unavailable", () => {
    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = undefined;
      expect(getApiKey()).toBeNull();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it("reads value from localStorage when available", () => {
    const originalWindow = (globalThis as any).window;
    const store = new Map<string, string>();
    const fakeWindow = {
      localStorage: {
        getItem(key: string) {
          return store.has(key) ? store.get(key)! : null;
        },
        setItem(key: string, value: string) {
          store.set(key, value);
        },
      },
    };

    try {
      (globalThis as any).window = fakeWindow;
      fakeWindow.localStorage.setItem("lg:chat:apiKey", "stored-key");
      expect(getApiKey()).toBe("stored-key");
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it("swallows storage errors and returns null", () => {
    const originalWindow = (globalThis as any).window;
    const fakeWindow = {
      localStorage: {
        getItem() {
          throw new Error("denied");
        },
      },
    };

    try {
      (globalThis as any).window = fakeWindow;
      expect(getApiKey()).toBeNull();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});
