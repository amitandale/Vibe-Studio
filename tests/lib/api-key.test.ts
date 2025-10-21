// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { getApiKey } from "@/lib/api-key";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as any).window;
  } else {
    (globalThis as any).window = originalWindow;
  }
});

describe("getApiKey", () => {
  it("returns null when window is undefined", () => {
    delete (globalThis as any).window;
    expect(getApiKey()).toBe(null);
  });

  it("reads the API key from localStorage", () => {
    const getItem = vi.fn(() => "secret");
    (globalThis as any).window = {
      localStorage: { getItem },
    } as Window;

    expect(getApiKey()).toBe("secret");
    expect(getItem.mock.calls.length).toBe(1);
    expect(getItem.mock.calls[0][0]).toBe("lg:chat:apiKey");
  });

  it("returns null when localStorage access throws", () => {
    const getItem = vi.fn(() => {
      throw new Error("nope");
    });
    (globalThis as any).window = {
      localStorage: { getItem },
    } as Window;

    expect(getApiKey()).toBe(null);
  });
});
