import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

function createExpect(received) {
  const expectApi = {
    toBe(expected) {
      assert.strictEqual(received, expected);
    },
    toEqual(expected) {
      assert.deepEqual(received, expected);
    },
    toStrictEqual(expected) {
      assert.deepStrictEqual(received, expected);
    },
    toBeTruthy() {
      assert.ok(received);
    },
    toBeFalsy() {
      assert.ok(!received);
    },
    toThrow(expected) {
      if (typeof received !== 'function') {
        throw new TypeError('expect(...).toThrow requires a function');
      }
      assert.throws(received, expected);
    },
    not: {
      toBe(expected) {
        assert.notStrictEqual(received, expected);
      },
      toEqual(expected) {
        assert.notDeepEqual(received, expected);
      },
    },
  };
  return expectApi;
}

function createMockFunction(initialImpl = () => {}) {
  let impl = initialImpl;
  const mockFn = (...args) => {
    mockFn.mock.calls.push(args);
    return impl(...args);
  };
  mockFn.mock = {
    calls: [],
  };
  mockFn.mockImplementation = (newImpl) => {
    impl = newImpl;
  };
  mockFn.mockReturnValue = (value) => {
    impl = () => value;
  };
  return mockFn;
}

function gatherBeforeEach(suite) {
  const stack = [];
  let cursor = suite;
  while (cursor) {
    stack.unshift(cursor);
    cursor = cursor.parent;
  }
  return stack.flatMap((item) => item.hooks.beforeEach);
}

function gatherAfterEach(suite) {
  const stack = [];
  let cursor = suite;
  while (cursor) {
    stack.push(cursor);
    cursor = cursor.parent;
  }
  return stack.flatMap((item) => item.hooks.afterEach);
}

function createSuite(name, parent, file) {
  return {
    name,
    parent,
    file,
    tests: [],
    children: [],
    hooks: {
      beforeEach: [],
      afterEach: [],
    },
  };
}

export class VitestRuntime {
  constructor() {
    this.rootSuite = createSuite('(root)', null, undefined);
    this.suiteStack = [this.rootSuite];
    this.currentFile = undefined;
  }

  withFile(file, loader) {
    const previous = this.currentFile;
    this.currentFile = file;
    const result = loader();
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        this.currentFile = previous;
      });
    }
    this.currentFile = previous;
    return result;
  }

  describe = (name, fn) => {
    const parent = this.suiteStack[this.suiteStack.length - 1];
    const suite = createSuite(name, parent, this.currentFile);
    parent.children.push(suite);
    this.suiteStack.push(suite);
    try {
      const outcome = fn();
      if (outcome && typeof outcome.then === 'function') {
        return outcome.finally(() => {
          this.suiteStack.pop();
        });
      }
    } finally {
      if (this.suiteStack[this.suiteStack.length - 1] === suite) {
        this.suiteStack.pop();
      }
    }
    return undefined;
  };

  it = (name, fn = () => {}) => {
    const parent = this.suiteStack[this.suiteStack.length - 1];
    const test = {
      name,
      fn,
      suite: parent,
      file: this.currentFile,
    };
    parent.tests.push(test);
  };

  beforeEach = (fn) => {
    const suite = this.suiteStack[this.suiteStack.length - 1];
    suite.hooks.beforeEach.push(fn);
  };

  afterEach = (fn) => {
    const suite = this.suiteStack[this.suiteStack.length - 1];
    suite.hooks.afterEach.push(fn);
  };

  expect = createExpect;

  vi = {
    fn: createMockFunction,
  };

  getGlobalApi() {
    return {
      describe: this.describe,
      it: this.it,
      test: this.it,
      expect: this.expect,
      beforeEach: this.beforeEach,
      afterEach: this.afterEach,
      vi: this.vi,
    };
  }

  async run() {
    const results = [];
    for (const child of this.rootSuite.children) {
      await this.#runSuite(child, [], results);
    }
    await this.#runTestsInSuite(this.rootSuite, [], results);
    return { tests: results };
  }

  async #runSuite(suite, ancestors, results) {
    const nextAncestors = suite.name === '(root)' ? ancestors : [...ancestors, suite.name];
    for (const child of suite.children) {
      await this.#runSuite(child, nextAncestors, results);
    }
    await this.#runTestsInSuite(suite, nextAncestors, results);
  }

  async #runTestsInSuite(suite, ancestors, results) {
    for (const test of suite.tests) {
      const titleParts = [...ancestors, test.name];
      const title = titleParts.filter(Boolean).join(' › ');
      try {
        for (const hook of gatherBeforeEach(test.suite)) {
          await hook();
        }
        const start = performance.now();
        await test.fn();
        const duration = performance.now() - start;
        for (const hook of gatherAfterEach(test.suite)) {
          await hook();
        }
        results.push({
          status: 'passed',
          title,
          duration,
          file: test.file,
        });
      } catch (error) {
        results.push({
          status: 'failed',
          title,
          error,
          file: test.file,
        });
      }
    }
  }
}

export function installGlobalApi(runtime) {
  const api = runtime.getGlobalApi();
  globalThis.__vitest = api;
  if (typeof globalThis.describe !== 'function') {
    globalThis.describe = api.describe;
  }
  if (typeof globalThis.it !== 'function') {
    globalThis.it = api.it;
  }
  if (typeof globalThis.test !== 'function') {
    globalThis.test = api.it;
  }
  if (typeof globalThis.expect !== 'function') {
    globalThis.expect = api.expect;
  }
  if (typeof globalThis.beforeEach !== 'function') {
    globalThis.beforeEach = api.beforeEach;
  }
  if (typeof globalThis.afterEach !== 'function') {
    globalThis.afterEach = api.afterEach;
  }
  return () => {
    delete globalThis.__vitest;
    delete globalThis.describe;
    delete globalThis.it;
    delete globalThis.test;
    delete globalThis.expect;
    delete globalThis.beforeEach;
    delete globalThis.afterEach;
  };
}
