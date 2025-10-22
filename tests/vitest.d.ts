type AnyFunction = (...args: any[]) => any;

type MockCall<TArgs extends any[]> = TArgs;

type MockResult<TResult> =
  | { type: "return"; value: TResult }
  | { type: "throw"; value: unknown };

type MockInstance<TArgs extends any[], TResult> = {
  (...args: TArgs): TResult;
  mock: {
    calls: MockCall<TArgs>[];
    instances: unknown[];
    results: MockResult<TResult>[];
    lastCall: MockCall<TArgs> | undefined;
    name: string;
  };
  mockImplementation(impl: (...args: TArgs) => TResult): MockInstance<TArgs, TResult>;
  mockImplementationOnce(impl: (...args: TArgs) => TResult): MockInstance<TArgs, TResult>;
  mockReturnValue(value: TResult): MockInstance<TArgs, TResult>;
  mockReturnValueOnce(value: TResult): MockInstance<TArgs, TResult>;
  mockResolvedValue(value: TResult): MockInstance<TArgs, Promise<TResult>>;
  mockResolvedValueOnce(value: TResult): MockInstance<TArgs, Promise<TResult>>;
  mockRejectedValue(error: unknown): MockInstance<TArgs, Promise<TResult>>;
  mockRejectedValueOnce(error: unknown): MockInstance<TArgs, Promise<TResult>>;
  mockName(name: string): MockInstance<TArgs, TResult>;
  getMockName(): string;
  mockClear(): MockInstance<TArgs, TResult>;
  mockReset(): MockInstance<TArgs, TResult>;
  mockRestore(): MockInstance<TArgs, TResult>;
};

type MatcherResult = { pass: boolean; message?: string | (() => string) };

type CustomMatcher = (this: { isNot: boolean; equals(a: unknown, b: unknown): boolean }, received: unknown, ...expected: unknown[]) => MatcherResult | void;

interface Expectation<T> {
  toBe(expected: T): void;
  toEqual(expected: unknown): void;
  toStrictEqual(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toBeNull(): void;
  toContain(expected: unknown): void;
  toHaveLength(length: number): void;
  toBeGreaterThan(expected: number): void;
  toBeLessThan(expected: number): void;
  toMatch(expected: RegExp | string): void;
  toMatchObject(expected: Record<string, unknown>): void;
  toHaveProperty(path: string | string[], value?: unknown): void;
  toThrow(expected?: unknown): void;
  toHaveBeenCalled(): void;
  toHaveBeenCalledTimes(count: number): void;
  toHaveBeenCalledWith(...args: unknown[]): void;
  toHaveReturnedWith(value: unknown): void;
  toHaveLastReturnedWith(value: unknown): void;
  not: Expectation<T>;
  resolves: PromiseLike<Expectation<Awaited<T>>>;
  rejects: PromiseLike<Expectation<any>>;
  [matcherName: string]: any;
}

interface Vi {
  fn<TArgs extends any[], TResult>(impl?: (...args: TArgs) => TResult): MockInstance<TArgs, TResult>;
  spyOn<T extends object, K extends keyof T>(object: T, method: K, accessType?: "get" | "set"): MockInstance<any[], any>;
  mock(moduleName: string, factory: () => unknown): void;
  doMock(moduleName: string, factory: () => unknown): void;
  unmock(moduleName: string): void;
  clearAllMocks(): void;
  resetAllMocks(): void;
  restoreAllMocks(): void;
  resetModules(): void;
  useFakeTimers(): void;
  useRealTimers(): void;
  advanceTimersByTime(ms: number): void;
  runAllTimers(): void;
  clearAllTimers(): void;
  setSystemTime(time: number | Date): void;
  getMockedSystemTime(): number;
  mocked<T>(value: T): T;
  isMockFunction(value: unknown): boolean;
  stubGlobal(name: string, value: unknown): void;
  unstubAllGlobals(): void;
  importActual<T>(moduleName: string, importer?: string): Promise<T>;
  importMock<T>(moduleName: string, importer?: string): Promise<T>;
}

declare module "vitest" {
  export const describe: (name: string, fn: () => void | Promise<void>) => void;
  export const it: (name: string, fn: () => void | Promise<void>) => void;
  export const test: typeof it;
  export const beforeEach: (fn: () => void | Promise<void>) => void;
  export const afterEach: (fn: () => void | Promise<void>) => void;
  export function expect<T>(actual: T): Expectation<T>;
  export namespace expect {
    function extend(matchers: Record<string, CustomMatcher>): void;
    function any(constructor: AnyFunction): { constructor: AnyFunction };
    function getState(): Record<string, unknown>;
    function setState(state: Record<string, unknown>): void;
  }
  export const vi: Vi;
}

declare module "vitest/config" {
  export function defineConfig<T>(config: T): T;
}
