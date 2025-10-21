import "@testing-library/jest-dom/vitest";
import { Buffer } from "node:buffer";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const ensureDomEnvironment = () => {
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    return;
  }

  class MockNode {
    parentNode: MockNode | null = null;
    childNodes: MockNode[] = [];
    textContent: string | null = null;
    nodeType: number;

    constructor(nodeType: number) {
      this.nodeType = nodeType;
    }

    appendChild<T extends MockNode>(node: T): T {
      this.childNodes.push(node);
      node.parentNode = this;
      return node;
    }

    removeChild<T extends MockNode>(node: T): T {
      const index = this.childNodes.indexOf(node);
      if (index >= 0) {
        this.childNodes.splice(index, 1);
        node.parentNode = null;
      }
      return node;
    }

    get firstChild(): MockNode | null {
      return this.childNodes[0] ?? null;
    }
  }

  class MockElement extends MockNode {
    nodeName: string;
    tagName: string;
    attributes = new Map<string, string>();
    style: Record<string, string> = {};
    ownerDocument: MockDocument;
    namespaceURI = "http://www.w3.org/1999/xhtml";

    constructor(ownerDocument: MockDocument, tagName: string) {
      super(1);
      this.ownerDocument = ownerDocument;
      this.nodeName = tagName.toUpperCase();
      this.tagName = this.nodeName;
    }

    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }

    removeAttribute(name: string) {
      this.attributes.delete(name);
    }

    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }
  }

  class MockText extends MockNode {
    nodeValue: string;

    constructor(text: string) {
      super(3);
      this.nodeValue = text;
      this.textContent = text;
    }
  }

  class MockDocument extends MockNode {
    body: MockElement;
    documentElement: MockElement;
    defaultView: (Window & typeof globalThis) | null = null;

    constructor() {
      super(9);
      this.documentElement = new MockElement(this, "html");
      this.body = new MockElement(this, "body");
      this.appendChild(this.documentElement);
      this.documentElement.appendChild(this.body);
    }

    createElement(tagName: string) {
      return new MockElement(this, tagName);
    }

    createElementNS(_namespace: string, tagName: string) {
      return new MockElement(this, tagName);
    }

    createTextNode(text: string) {
      return new MockText(text);
    }

    removeChild<T extends MockNode>(node: T): T {
      return super.removeChild(node);
    }
  }

  const mockDocument = new MockDocument();

  const listeners = new Map<string, Set<EventListener>>();
  const eventTarget = {
    addEventListener(type: string, listener: EventListener) {
      const set = listeners.get(type) ?? new Set<EventListener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: EventListener) {
      const set = listeners.get(type);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) {
        listeners.delete(type);
      }
    },
    dispatchEvent(event: Event) {
      const set = listeners.get(event.type);
      if (!set) return false;
      set.forEach((listener) => listener.call(windowObject, event));
      return true;
    },
  };

  const windowObject = (globalThis as { window?: Window & typeof globalThis }).window ??
    ({} as Window & typeof globalThis);

  const navigatorValue = (globalThis.navigator ?? {
    userAgent: "node",
    language: "en-US",
    languages: ["en-US"],
    clipboard: {
      writeText: async () => {},
    },
  }) as Navigator;

  Object.assign(windowObject, eventTarget, {
    document: mockDocument as unknown as Document,
  });

  Object.defineProperty(windowObject, "navigator", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: navigatorValue,
  });

  (windowObject as { HTMLElement?: typeof HTMLElement }).HTMLElement =
    MockElement as unknown as typeof HTMLElement;
  (windowObject as { Node?: typeof Node }).Node =
    MockNode as unknown as typeof Node;
  (windowObject as { Document?: typeof Document }).Document =
    MockDocument as unknown as typeof Document;

  mockDocument.defaultView = windowObject;

  (globalThis as { window?: Window & typeof globalThis }).window = windowObject;
  (globalThis as { document?: Document }).document =
    mockDocument as unknown as Document;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: windowObject.navigator,
  });
};

ensureDomEnvironment();

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
