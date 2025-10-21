import "@testing-library/jest-dom/vitest";
import { Buffer } from "node:buffer";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const originalFetch = globalThis.fetch;
const originalCrypto = globalThis.crypto;

const createMemoryStorage = () => {
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
  } satisfies Storage;
};

const ensureLocalStorage = () => {
  const storage = createMemoryStorage();
  let globalWindow = typeof window !== "undefined" ? window : undefined;

  if (!globalWindow) {
    globalWindow = { localStorage: storage } as Window & typeof globalThis;
    (globalThis as { window?: Window & typeof globalThis }).window = globalWindow;
  }

  Object.defineProperty(globalWindow, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });

  (globalThis as { localStorage?: Storage }).localStorage = storage;
};

const ensureMatchMedia = () => {
  if (typeof window === "undefined") return;

  type Listener = (event: MediaQueryListEvent) => void;
  const listeners = new Map<string, Set<Listener>>();

  window.matchMedia = (query: string) => {
    let matches = false;
    const listenerSet = listeners.get(query) ?? new Set<Listener>();
    listeners.set(query, listenerSet);

    return {
      media: query,
      get matches() {
        return matches;
      },
      set matches(value: boolean) {
        matches = value;
      },
      onchange: null,
      addEventListener: (_event: "change", listener: Listener) => {
        listenerSet.add(listener);
      },
      removeEventListener: (_event: "change", listener: Listener) => {
        listenerSet.delete(listener);
      },
      addListener: (listener: Listener) => {
        listenerSet.add(listener);
      },
      removeListener: (listener: Listener) => {
        listenerSet.delete(listener);
      },
      dispatchEvent: (event: MediaQueryListEvent) => {
        listenerSet.forEach((listener) => listener(event));
        return true;
      },
      _simulateMatchChange(value: boolean) {
        matches = value;
        const event = { media: query, matches: value } as MediaQueryListEvent;
        listenerSet.forEach((listener) => listener(event));
      },
    } as MediaQueryList & { _simulateMatchChange(value: boolean): void };
  };
};

const ensureObservers = () => {
  class ResizeObserverStub implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class IntersectionObserverStub implements IntersectionObserver {
    root: Element | Document | null = null;
    rootMargin = "0px";
    thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverStub;
  (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
};

const ensureBroadcastChannel = () => {
  class BroadcastChannelStub implements BroadcastChannel {
    name: string;
    onmessage: ((this: BroadcastChannel, ev: MessageEvent) => any) | null = null;
    onmessageerror: ((this: BroadcastChannel, ev: MessageEvent) => any) | null = null;

    constructor(name: string) {
      this.name = name;
    }

    postMessage(): void {}
    close(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean {
      return true;
    }
  }

  (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel =
    BroadcastChannelStub as unknown as typeof BroadcastChannel;
};

const ensureCrypto = () => {
  const randomUUID = () => "00000000-0000-0000-0000-000000000000";
  (globalThis as { crypto?: Crypto }).crypto = {
    ...(originalCrypto ?? {}),
    randomUUID,
  } as Crypto;
};

const ensureFileReader = () => {
  class FileReaderStub {
    result: string | ArrayBuffer | null = null;
    onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null =
      null;
    onloadend:
      | ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown)
      | null = null;
    onerror:
      | ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown)
      | null = null;

    readAsDataURL(file: Blob) {
      Promise.resolve()
        .then(() => file.arrayBuffer())
        .then((arrayBuffer) => {
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          const mime = (file as { type?: string }).type ?? "application/octet-stream";
          this.result = `data:${mime};base64,${base64}`;
          const event = { target: this } as unknown as ProgressEvent<FileReader>;
          this.onload?.call(this as unknown as FileReader, event);
          this.onloadend?.call(this as unknown as FileReader, event);
        })
        .catch((error) => {
          const event = { target: this, error } as unknown as ProgressEvent<FileReader>;
          this.onerror?.call(this as unknown as FileReader, event);
          this.onloadend?.call(this as unknown as FileReader, event);
        });
    }

    readAsArrayBuffer(file: Blob) {
      Promise.resolve()
        .then(() => file.arrayBuffer())
        .then((arrayBuffer) => {
          this.result = arrayBuffer;
          const event = { target: this } as unknown as ProgressEvent<FileReader>;
          this.onload?.call(this as unknown as FileReader, event);
          this.onloadend?.call(this as unknown as FileReader, event);
        })
        .catch((error) => {
          const event = { target: this, error } as unknown as ProgressEvent<FileReader>;
          this.onerror?.call(this as unknown as FileReader, event);
          this.onloadend?.call(this as unknown as FileReader, event);
        });
    }

    abort() {
      // no-op for tests
    }
  }

  (globalThis as { FileReader?: typeof FileReader }).FileReader =
    FileReaderStub as unknown as typeof FileReader;
};

ensureLocalStorage();
ensureMatchMedia();
ensureObservers();
ensureBroadcastChannel();
ensureCrypto();
ensureFileReader();

if (!originalFetch) {
  globalThis.fetch = vi.fn(async () => {
    throw new Error("fetch not implemented in tests");
  });
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch ?? (async () => {
    throw new Error("fetch not implemented in tests");
  });
});
