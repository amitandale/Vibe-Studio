import { toast } from "sonner";

const globalAny = globalThis as any;

if (!globalAny.window) {
  globalAny.window = globalAny;
}

if (!globalAny.document) {
  globalAny.document = {
    createElement: () => ({ style: {} }),
    body: {
      appendChild: () => {},
    },
  };
}

class MemoryStorage {
  store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

if (!globalAny.window.localStorage) {
  globalAny.window.localStorage = new MemoryStorage();
}

globalAny.window.sessionStorage = new MemoryStorage();

globalAny.window.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
});

globalAny.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

globalAny.IntersectionObserver = class {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

globalAny.BroadcastChannel = class {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(name: string) {
    this.name = name;
  }
  postMessage(_message: unknown) {}
  close() {}
  addEventListener(_type: string, _listener: () => void) {}
  removeEventListener(_type: string, _listener: () => void) {}
};

globalAny.crypto = {
  randomUUID: () => "00000000-0000-4000-8000-000000000000",
};

globalAny.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({}),
  text: async () => "",
});

if (typeof globalAny.afterEach === "function") {
  globalAny.afterEach(() => {
    toast.reset();
    (globalAny.window.localStorage as MemoryStorage).clear();
  });
}

export {};
