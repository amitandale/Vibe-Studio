if (typeof globalThis.fetch !== "function") {
  // @ts-expect-error - minimal fetch polyfill for tests
  globalThis.fetch = async () => ({ ok: true });
}

export {};
