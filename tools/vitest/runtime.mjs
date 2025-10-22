import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { inspect } from "node:util";

const customMatchers = new Map();

function isPromise(value) {
  return Boolean(value) && typeof value.then === "function";
}

function format(value) {
  return inspect(value, { depth: Infinity, colors: false });
}

function toComparable(value) {
  if (value instanceof Map) {
    return new Map(Array.from(value.entries()).map(([k, v]) => [toComparable(k), toComparable(v)]));
  }
  if (value instanceof Set) {
    return new Set(Array.from(value.values()).map((item) => toComparable(item)));
  }
  if (Array.isArray(value)) {
    return value.map(toComparable);
  }
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, val] of Object.entries(value)) {
      output[key] = toComparable(val);
    }
    return output;
  }
  return value;
}

function runMatcher(result, negate, matcherName) {
  const pass = Boolean(result.pass);
  const messageFactory =
    typeof result.message === "function"
      ? result.message
      : () => result.message ?? `Expectation ${matcherName} ${negate ? "not " : ""}failed.`;

  if (pass === negate) {
    throw new assert.AssertionError({
      message: messageFactory(),
      stackStartFn: runMatcher,
    });
  }
}

function buildMatcherContext(received, negate) {
  return {
    isNot: negate,
    equals(a, b) {
      try {
        assert.deepStrictEqual(toComparable(a), toComparable(b));
        return true;
      } catch {
        return false;
      }
    },
    utils: {
      inspect: format,
    },
  };
}

function registerDefaultMatchers(target, received, negate) {
  const comparator = negate ? (pass) => !pass : (pass) => pass;

  target.toBe = (expected) => {
    const pass = Object.is(received, expected);
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected ${format(received)} ${negate ? "not " : ""}to be ${format(expected)}`,
        stackStartFn: target.toBe,
      });
    }
  };

  target.toEqual = (expected) => {
    try {
      assert.deepEqual(toComparable(received), toComparable(expected));
      if (!comparator(true)) {
        throw new assert.AssertionError({
          message: `Expected ${format(received)} not to equal ${format(expected)}`,
          stackStartFn: target.toEqual,
        });
      }
    } catch (error) {
      if (comparator(false)) {
        throw error;
      }
    }
  };

  target.toStrictEqual = (expected) => {
    try {
      assert.deepStrictEqual(received, expected);
      if (!comparator(true)) {
        throw new assert.AssertionError({
          message: `Expected ${format(received)} not to strictly equal ${format(expected)}`,
          stackStartFn: target.toStrictEqual,
        });
      }
    } catch (error) {
      if (comparator(false)) {
        throw error;
      }
    }
  };

  target.toBeTruthy = () => {
    const pass = Boolean(received);
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected value to ${negate ? "be" : "not be"} truthy, received ${format(received)}`,
        stackStartFn: target.toBeTruthy,
      });
    }
  };

  target.toBeFalsy = () => {
    const pass = !received;
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected value to ${negate ? "be" : "not be"} falsy, received ${format(received)}`,
        stackStartFn: target.toBeFalsy,
      });
    }
  };

  target.toBeDefined = () => {
    const pass = received !== undefined;
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected value to ${negate ? "be" : "not be"} defined, received ${format(received)}`,
        stackStartFn: target.toBeDefined,
      });
    }
  };

  target.toBeUndefined = () => {
    const pass = received === undefined;
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected value to ${negate ? "be" : "not be"} undefined, received ${format(received)}`,
        stackStartFn: target.toBeUndefined,
      });
    }
  };

  target.toBeNull = () => {
    const pass = received === null;
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected value to ${negate ? "be" : "not be"} null, received ${format(received)}`,
        stackStartFn: target.toBeNull,
      });
    }
  };

  target.toContain = (item) => {
    let pass = false;
    if (typeof received === "string") {
      pass = received.includes(item);
    } else if (Array.isArray(received)) {
      pass = received.some((entry) => {
        try {
          assert.deepStrictEqual(entry, item);
          return true;
        } catch {
          return false;
        }
      });
    }

    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected ${format(received)} ${negate ? "not " : ""}to contain ${format(item)}`,
        stackStartFn: target.toContain,
      });
    }
  };

  target.toHaveLength = (length) => {
    const actual = received?.length;
    const pass = actual === length;
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected length ${length}, received ${actual}`,
        stackStartFn: target.toHaveLength,
      });
    }
  };

  target.toBeGreaterThan = (expected) => {
    const pass = Number(received) > Number(expected);
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected ${format(received)} ${negate ? "not " : ""}to be greater than ${format(expected)}`,
        stackStartFn: target.toBeGreaterThan,
      });
    }
  };

  target.toBeLessThan = (expected) => {
    const pass = Number(received) < Number(expected);
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected ${format(received)} ${negate ? "not " : ""}to be less than ${format(expected)}`,
        stackStartFn: target.toBeLessThan,
      });
    }
  };

  target.toMatch = (pattern) => {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
    const pass = regex.test(String(received));
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected ${format(received)} ${negate ? "not " : ""}to match ${format(regex)}`,
        stackStartFn: target.toMatch,
      });
    }
  };

  target.toMatchObject = (expected) => {
    if (received === null || typeof received !== "object") {
      throw new assert.AssertionError({
        message: "Received value must be an object",
        stackStartFn: target.toMatchObject,
      });
    }

    const pass = Object.entries(expected ?? {}).every(([key, value]) => {
      if (!(key in received)) return false;
      try {
        assert.deepStrictEqual(received[key], value);
        return true;
      } catch {
        return false;
      }
    });

    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected object ${negate ? "not " : ""}to match subset ${format(expected)}`,
        stackStartFn: target.toMatchObject,
      });
    }
  };

  target.toHaveProperty = (path, expected) => {
    const segments = Array.isArray(path) ? path : String(path).split(".");
    let cursor = received;
    for (const segment of segments) {
      if (cursor == null || !(segment in cursor)) {
        if (comparator(false)) {
          throw new assert.AssertionError({
            message: `Expected property path ${segments.join(".")} to exist`,
            stackStartFn: target.toHaveProperty,
          });
        }
        return;
      }
      cursor = cursor[segment];
    }

    if (arguments.length === 2) {
      try {
        assert.deepStrictEqual(cursor, expected);
        if (!comparator(true)) {
          throw new assert.AssertionError({
            message: `Expected property value ${negate ? "not " : ""}to equal ${format(expected)}`,
            stackStartFn: target.toHaveProperty,
          });
        }
      } catch (error) {
        if (comparator(false)) {
          throw error;
        }
      }
    }
  };

  target.toThrow = (expected) => {
    if (typeof received !== "function") {
      throw new TypeError("expect(...).toThrow requires a function");
    }

    let threw = false;
    let error;
    try {
      received();
    } catch (err) {
      threw = true;
      error = err;
    }

    if (!comparator(threw)) {
      throw new assert.AssertionError({
        message: `Expected function ${negate ? "not " : ""}to throw`,
        stackStartFn: target.toThrow,
      });
    }

    if (expected && threw) {
      if (typeof expected === "string") {
        const pass = String(error?.message ?? "").includes(expected);
        if (!comparator(pass)) {
          throw new assert.AssertionError({
            message: `Expected thrown error message ${negate ? "not " : ""}to contain ${expected}`,
            stackStartFn: target.toThrow,
          });
        }
      } else if (expected instanceof RegExp) {
        const pass = expected.test(String(error?.message ?? ""));
        if (!comparator(pass)) {
          throw new assert.AssertionError({
            message: `Expected thrown error message ${negate ? "not " : ""}to match ${expected}`,
            stackStartFn: target.toThrow,
          });
        }
      } else if (typeof expected === "function") {
        const pass = error instanceof expected;
        if (!comparator(pass)) {
          throw new assert.AssertionError({
            message: `Expected thrown error ${negate ? "not " : ""}to be instance of ${expected.name}`,
            stackStartFn: target.toThrow,
          });
        }
      }
    }
  };

  target.toHaveBeenCalled = () => {
    if (!received || !received.mock) {
      throw new TypeError("Received value is not a mock function");
    }
    const pass = received.mock.calls.length > 0;
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected mock ${negate ? "not " : ""}to have been called`,
        stackStartFn: target.toHaveBeenCalled,
      });
    }
  };

  target.toHaveBeenCalledTimes = (count) => {
    if (!received || !received.mock) {
      throw new TypeError("Received value is not a mock function");
    }
    const actual = received.mock.calls.length;
    const pass = actual === count;
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected mock to be called ${count} times, received ${actual}`,
        stackStartFn: target.toHaveBeenCalledTimes,
      });
    }
  };

  target.toHaveBeenCalledWith = (...args) => {
    if (!received || !received.mock) {
      throw new TypeError("Received value is not a mock function");
    }
    const pass = received.mock.calls.some((call) => {
      try {
        assert.deepStrictEqual(call, args);
        return true;
      } catch {
        return false;
      }
    });
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected mock ${negate ? "not " : ""}to have been called with ${format(args)}`,
        stackStartFn: target.toHaveBeenCalledWith,
      });
    }
  };

  target.toHaveReturnedWith = (value) => {
    if (!received || !received.mock) {
      throw new TypeError("Received value is not a mock function");
    }
    const pass = received.mock.results.some((result) => result.type === "return" && Object.is(result.value, value));
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected mock ${negate ? "not " : ""}to have returned ${format(value)}`,
        stackStartFn: target.toHaveReturnedWith,
      });
    }
  };

  target.toHaveLastReturnedWith = (value) => {
    if (!received || !received.mock) {
      throw new TypeError("Received value is not a mock function");
    }
    const last = received.mock.results.at(-1);
    const pass = last?.type === "return" && Object.is(last.value, value);
    if (!comparator(pass)) {
      throw new assert.AssertionError({
        message: `Expected last return value ${negate ? "not " : ""}to equal ${format(value)}`,
        stackStartFn: target.toHaveLastReturnedWith,
      });
    }
  };

  for (const [name, matcher] of customMatchers.entries()) {
    target[name] = (...matcherArgs) => {
      const context = buildMatcherContext(received, negate);
      const result = matcher.call(context, received, ...matcherArgs);
      runMatcher(result ?? { pass: true }, negate, name);
    };
  }
}

function createExpect() {
  const expectFn = (received) => {
    const positive = {};
    registerDefaultMatchers(positive, received, false);
    const negative = {};
    registerDefaultMatchers(negative, received, true);
    positive.not = negative;

    if (isPromise(received)) {
      positive.resolves = {
        then(onFulfilled, onRejected) {
          return received.then(
            (value) => {
              expectFn(value);
              return onFulfilled?.(value);
            },
            onRejected,
          );
        },
      };
      positive.rejects = {
        then(onFulfilled, onRejected) {
          return received.then(onFulfilled, (error) => {
            expectFn(error);
            return onRejected?.(error);
          });
        },
      };
    }

    return positive;
  };

  expectFn.extend = (matchers) => {
    for (const [name, matcher] of Object.entries(matchers ?? {})) {
      if (typeof matcher !== "function") {
        throw new TypeError(`Matcher ${name} must be a function`);
      }
      customMatchers.set(name, matcher);
    }
  };

  expectFn.any = (constructor) => ({
    $$typeof: Symbol.for("vitest.expect.any"),
    constructor,
  });

  expectFn.getState = () => ({
    testPath: undefined,
    currentTestName: undefined,
  });

  expectFn.setState = () => {};

  return expectFn;
}

let mockIdCounter = 0;

function createMockFunction(initialImpl = () => undefined) {
  let impl = initialImpl;
  const onceQueue = [];

  const mockFn = function mockFunction(...args) {
    const callId = mockFn.mock.calls.length;
    const context = this;
    mockFn.mock.instances.push(context);
    mockFn.mock.calls.push(args);
    mockFn.mock.lastCall = args;

    const activeImpl = onceQueue.length > 0 ? onceQueue.shift() : impl;

    try {
      const result = activeImpl.apply(context, args);
      mockFn.mock.results.push({ type: "return", value: result });
      return result;
    } catch (error) {
      mockFn.mock.results.push({ type: "throw", value: error });
      throw error;
    } finally {
      mockFn.mock.invocationCallOrder.push(callId + 1);
    }
  };

  mockFn.mock = {
    calls: [],
    instances: [],
    results: [],
    invocationCallOrder: [],
    lastCall: undefined,
    name: "vi.fn",
  };

  mockFn.mockImplementation = (newImpl) => {
    impl = typeof newImpl === "function" ? newImpl : () => newImpl;
    return mockFn;
  };

  mockFn.mockImplementationOnce = (newImpl) => {
    onceQueue.push(typeof newImpl === "function" ? newImpl : () => newImpl);
    return mockFn;
  };

  mockFn.mockReturnValue = (value) => {
    impl = () => value;
    return mockFn;
  };

  mockFn.mockReturnValueOnce = (value) => {
    onceQueue.push(() => value);
    return mockFn;
  };

  mockFn.mockResolvedValue = (value) => {
    impl = () => Promise.resolve(value);
    return mockFn;
  };

  mockFn.mockResolvedValueOnce = (value) => {
    onceQueue.push(() => Promise.resolve(value));
    return mockFn;
  };

  mockFn.mockRejectedValue = (error) => {
    impl = () => Promise.reject(error);
    return mockFn;
  };

  mockFn.mockRejectedValueOnce = (error) => {
    onceQueue.push(() => Promise.reject(error));
    return mockFn;
  };

  mockFn.mockName = (name) => {
    mockFn.mock.name = name;
    return mockFn;
  };

  mockFn.getMockName = () => mockFn.mock.name;

  mockFn.mockClear = () => {
    mockFn.mock.calls = [];
    mockFn.mock.instances = [];
    mockFn.mock.results = [];
    mockFn.mock.invocationCallOrder = [];
    mockFn.mock.lastCall = undefined;
    return mockFn;
  };

  mockFn.mockReset = () => {
    mockFn.mockClear();
    impl = initialImpl;
    onceQueue.length = 0;
    return mockFn;
  };

  mockFn.mockRestore = () => {
    if (mockFn.__originalTarget) {
      mockFn.__originalTarget[mockFn.__originalKey] = mockFn.__originalImpl;
    }
    return mockFn.mockReset();
  };

  mockFn._mockId = mockIdCounter += 1;

  return mockFn;
}

class FakeTimersController {
  constructor() {
    this.active = false;
    this.now = Date.now();
    this.timers = new Map();
    this.order = 0;
    this.originals = null;
  }

  useFakeTimers() {
    if (this.active) return;
    this.active = true;
    this.now = Date.now();
    this.originals = {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      Date: globalThis.Date,
    };

    globalThis.Date = class MockedDate extends Date {
      constructor(...args) {
        if (args.length === 0) {
          super(FakeTimersController.__controller.now);
        } else {
          super(...args);
        }
      }
      static now() {
        return FakeTimersController.__controller.now;
      }
    };

    const schedule = (type) => (callback, delay = 0, ...args) => {
      const id = `${type}-${++this.order}`;
      this.timers.set(id, {
        type,
        callback,
        time: this.now + Number(delay),
        interval: type === "interval" ? Number(delay) : null,
        args,
      });
      return id;
    };

    const cancel = (id) => {
      this.timers.delete(String(id));
    };

    globalThis.setTimeout = schedule("timeout");
    globalThis.setInterval = schedule("interval");
    globalThis.clearTimeout = cancel;
    globalThis.clearInterval = cancel;

    FakeTimersController.__controller = this;
  }

  useRealTimers() {
    if (!this.active) return;
    this.active = false;
    for (const [key, value] of Object.entries(this.originals ?? {})) {
      globalThis[key] = value;
    }
    this.originals = null;
    this.timers.clear();
  }

  advanceTimersByTime(duration) {
    const limit = this.now + Number(duration);
    while (true) {
      const next = this.#nextTimer();
      if (!next) break;
      if (next.time > limit) break;
      this.now = next.time;
      this.timers.delete(next.id);
      try {
        next.callback(...next.args);
      } finally {
        if (next.type === "interval") {
          next.time += next.interval;
          this.timers.set(next.id, next);
        }
      }
    }
    this.now = limit;
  }

  runAllTimers() {
    while (this.timers.size > 0) {
      this.advanceTimersByTime(0);
    }
  }

  clearAllTimers() {
    this.timers.clear();
  }

  setSystemTime(time) {
    this.now = typeof time === "number" ? time : new Date(time).getTime();
  }

  getMockedSystemTime() {
    return this.now;
  }

  #nextTimer() {
    let candidate = null;
    for (const [id, timer] of this.timers.entries()) {
      if (!candidate || timer.time < candidate.time) {
        candidate = { ...timer, id };
      }
    }
    return candidate;
  }
}

FakeTimersController.__controller = null;

class GlobalStubsRegistry {
  constructor() {
    this.stubs = new Map();
  }

  stub(name, value) {
    if (!this.stubs.has(name)) {
      this.stubs.set(name, {
        original: globalThis[name],
      });
    }
    globalThis[name] = value;
  }

  restoreAll() {
    for (const [name, entry] of this.stubs.entries()) {
      if (entry.original === undefined) {
        delete globalThis[name];
      } else {
        globalThis[name] = entry.original;
      }
    }
    this.stubs.clear();
  }
}

class MockRegistry {
  constructor() {
    this.modules = new Map();
  }

  mock(id, factory) {
    this.modules.set(id, { factory, instance: undefined });
  }

  unmock(id) {
    this.modules.delete(id);
  }

  resolve(request, loader, resolvedPath) {
    const keys = [request];
    if (resolvedPath) {
      keys.push(resolvedPath);
    }

    for (const key of keys) {
      if (this.modules.has(key)) {
        const entry = this.modules.get(key);
        if (entry.instance === undefined) {
          entry.instance = entry.factory();
        }
        return entry.instance;
      }
    }

    return loader();
  }

  getMock(request, resolvedPath) {
    const keys = [request];
    if (resolvedPath) {
      keys.push(resolvedPath);
    }
    for (const key of keys) {
      if (this.modules.has(key)) {
        return this.modules.get(key);
      }
    }
    return undefined;
  }

  clearInstances() {
    for (const entry of this.modules.values()) {
      entry.instance = undefined;
    }
  }

  reset() {
    this.modules.clear();
  }
}

function createVi(runtime) {
  const timers = runtime.timers;
  const stubs = runtime.globalStubs;
  const registry = runtime.mockRegistry;

  const vi = {
    fn: (impl) => createMockFunction(impl ?? (() => undefined)),
    spyOn(object, key, accessType) {
      if (!object) {
        throw new TypeError("Cannot spyOn on undefined or null value");
      }
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor) {
        throw new TypeError(`Property ${String(key)} does not exist`);
      }

      if (accessType) {
        const original = descriptor[accessType];
        if (typeof original !== "function") {
          throw new TypeError(`Property ${String(key)} does not have a ${accessType}`);
        }
        const mock = createMockFunction(original);
        Object.defineProperty(object, key, {
          ...descriptor,
          [accessType]: mock,
        });
        mock.__originalTarget = object;
        mock.__originalKey = key;
        mock.__originalImpl = original;
        return mock;
      }

      if (typeof descriptor.value !== "function") {
        throw new TypeError(`Property ${String(key)} is not a function`);
      }

      const original = descriptor.value;
      const mock = createMockFunction(original);
      mock.__originalTarget = object;
      mock.__originalKey = key;
      mock.__originalImpl = original;
      object[key] = mock;
      return mock;
    },
    mock(id, factory) {
      registry.mock(id, () => (typeof factory === "function" ? factory() : factory));
    },
    doMock(id, factory) {
      vi.mock(id, factory);
    },
    unmock(id) {
      registry.unmock(id);
    },
    clearAllMocks() {
      runtime.mocks.forEach((mock) => mock.mockClear());
      registry.clearInstances();
    },
    resetAllMocks() {
      runtime.mocks.forEach((mock) => mock.mockReset());
      registry.reset();
    },
    restoreAllMocks() {
      runtime.mocks.forEach((mock) => mock.mockRestore());
      registry.reset();
    },
    resetModules() {
      if (runtime.moduleLoader && typeof runtime.moduleLoader.clearCache === "function") {
        runtime.moduleLoader.clearCache();
      }
    },
    useFakeTimers() {
      timers.useFakeTimers();
    },
    useRealTimers() {
      timers.useRealTimers();
    },
    advanceTimersByTime(ms) {
      timers.advanceTimersByTime(ms);
    },
    runAllTimers() {
      timers.runAllTimers();
    },
    clearAllTimers() {
      timers.clearAllTimers();
    },
    setSystemTime(time) {
      timers.setSystemTime(time);
    },
    getMockedSystemTime() {
      return timers.getMockedSystemTime();
    },
    mocked(value) {
      return value;
    },
    isMockFunction(value) {
      return Boolean(value && value.mock && Array.isArray(value.mock.calls));
    },
    stubGlobal(name, value) {
      stubs.stub(name, value);
    },
    unstubAllGlobals() {
      stubs.restoreAll();
    },
    importActual: async (id, importer) => {
      if (!runtime.moduleLoader) {
        throw new Error("Module loader is not initialized");
      }
      return runtime.moduleLoader.importModule(id, importer, { useMocks: false });
    },
    importMock: async (id, importer) => {
      if (!runtime.moduleLoader) {
        throw new Error("Module loader is not initialized");
      }
      const mock = runtime.mockRegistry.getMock(id);
      if (!mock) {
        throw new Error(`No mock registered for ${id}`);
      }
      if (mock.instance === undefined) {
        mock.instance = typeof mock.factory === "function" ? mock.factory() : mock.factory;
      }
      return mock.instance;
    },
  };

  return vi;
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
    this.rootSuite = createSuite("(root)", null, undefined);
    this.suiteStack = [this.rootSuite];
    this.currentFile = undefined;
    this.expect = createExpect();
    this.timers = new FakeTimersController();
    this.globalStubs = new GlobalStubsRegistry();
    this.mockRegistry = new MockRegistry();
    this.mocks = new Set();
    this.vi = createVi(this);
  }

  trackMock(mock) {
    this.mocks.add(mock);
  }

  withFile(file, loader) {
    const previous = this.currentFile;
    this.currentFile = file;
    const result = loader();
    if (result && typeof result.then === "function") {
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
      if (outcome && typeof outcome.then === "function") {
        return outcome.finally(() => {
          if (this.suiteStack[this.suiteStack.length - 1] === suite) {
            this.suiteStack.pop();
          }
        });
      }
    } finally {
      if (this.suiteStack[this.suiteStack.length - 1] === suite) {
        this.suiteStack.pop();
      }
    }
    return undefined;
  };

  it = (name, fn = () => undefined) => {
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

  getGlobalApi() {
    const expectFn = this.expect;
    const vi = new Proxy(this.vi, {
      get: (target, key) => {
        const value = target[key];
        if (typeof value === "function") {
          return (...args) => {
            const result = value.apply(target, args);
            if (result && typeof result === "function" && result.mock) {
              this.trackMock(result);
            }
            return result;
          };
        }
        return value;
      },
    });

    return {
      describe: this.describe,
      it: this.it,
      test: this.it,
      expect: expectFn,
      beforeEach: this.beforeEach,
      afterEach: this.afterEach,
      vi,
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
    const nextAncestors = suite.name === "(root)" ? ancestors : [...ancestors, suite.name];
    for (const child of suite.children) {
      await this.#runSuite(child, nextAncestors, results);
    }
    await this.#runTestsInSuite(suite, nextAncestors, results);
  }

  async #runTestsInSuite(suite, ancestors, results) {
    for (const test of suite.tests) {
      const titleParts = [...ancestors, test.name];
      const title = titleParts.filter(Boolean).join(" › ");
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
          status: "passed",
          title,
          duration,
          file: test.file,
        });
      } catch (error) {
        results.push({
          status: "failed",
          title,
          error,
          file: test.file,
        });
      } finally {
        this.vi.clearAllMocks();
        this.globalStubs.restoreAll();
        this.timers.useRealTimers();
      }
    }
  }
}

export function installGlobalApi(runtime) {
  const api = runtime.getGlobalApi();
  globalThis.__vitest = api;
  if (typeof globalThis.describe !== "function") {
    globalThis.describe = api.describe;
  }
  if (typeof globalThis.it !== "function") {
    globalThis.it = api.it;
  }
  if (typeof globalThis.test !== "function") {
    globalThis.test = api.it;
  }
  if (typeof globalThis.expect !== "function") {
    globalThis.expect = api.expect;
  }
  if (typeof globalThis.beforeEach !== "function") {
    globalThis.beforeEach = api.beforeEach;
  }
  if (typeof globalThis.afterEach !== "function") {
    globalThis.afterEach = api.afterEach;
  }
  if (typeof globalThis.vi !== "object") {
    globalThis.vi = api.vi;
  }
  return () => {
    delete globalThis.__vitest;
    delete globalThis.describe;
    delete globalThis.it;
    delete globalThis.test;
    delete globalThis.expect;
    delete globalThis.beforeEach;
    delete globalThis.afterEach;
    delete globalThis.vi;
  };
}
