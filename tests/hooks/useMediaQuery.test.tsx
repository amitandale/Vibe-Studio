import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "@/hooks/useMediaQuery";

describe("useMediaQuery", () => {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = false;
  const addListenerSpy = vi.fn();
  const removeListenerSpy = vi.fn();

  beforeEach(() => {
    if (typeof window === "undefined") {
      (globalThis as { window?: typeof globalThis & Window }).window =
        {} as Window & typeof globalThis;
    }
    listeners.clear();
    matches = false;
    addListenerSpy.mock.calls = [];
    removeListenerSpy.mock.calls = [];

    const matchMediaMock = vi.fn();
    matchMediaMock.mockImplementation((query: string) => ({
      media: query,
      get matches() {
        return matches;
      },
      addEventListener: (_event: "change", listener: (e: MediaQueryListEvent) => void) => {
        listeners.add(listener);
        addListenerSpy(listener);
      },
      removeEventListener: (_event: "change", listener: (e: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
        removeListenerSpy(listener);
      },
      dispatchEvent: (event: MediaQueryListEvent) => {
        listeners.forEach((listener) => listener(event));
        return true;
      },
    }));
    window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;
  });

  it("initializes using the current matchMedia state", () => {
    matches = true;
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(true);
  });

  it("updates when the media query listener fires", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);

    const event = { matches: true, media: "(min-width: 768px)" } as MediaQueryListEvent;
    act(() => {
      matches = true;
      listeners.forEach((listener) => listener(event));
    });

    expect(result.current).toBe(true);
  });

  it("cleans up the change listener on unmount", () => {
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    const registeredListener = addListenerSpy.mock.calls[0][0];

    unmount();

    const listenerArguments = removeListenerSpy.mock.calls.map((call) => call[0]);
    expect(listenerArguments.includes(registeredListener)).toBe(true);
  });
});
