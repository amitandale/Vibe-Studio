const getApi = () => {
  const api = globalThis.__vitest;
  if (!api) {
    throw new Error("Vitest runtime is not initialized. Ensure tests run via the local vitest runner.");
  }
  return api;
};

export const describe = (...args) => getApi().describe(...args);
export const it = (...args) => getApi().it(...args);
export const test = (...args) => getApi().test(...args);
export const expect = (...args) => getApi().expect(...args);
export const beforeEach = (...args) => getApi().beforeEach(...args);
export const afterEach = (...args) => getApi().afterEach(...args);
export const vi = new Proxy(
  {},
  {
    get(_, prop) {
      const api = getApi().vi;
      return api[prop].bind(api);
    },
  },
);
