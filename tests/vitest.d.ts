declare module "vitest" {
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => unknown | Promise<unknown>): void;
  export const test: typeof it;
  export function beforeEach(fn: () => unknown | Promise<unknown>): void;
  export function afterEach(fn: () => unknown | Promise<unknown>): void;
  export function expect<T>(actual: T): {
    toBe(expected: T): void;
    toEqual(expected: T): void;
    toStrictEqual(expected: T): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toThrow(expected?: unknown): void;
    not: {
      toBe(expected: T): void;
      toEqual(expected: T): void;
    };
  };

  type MockFunction<TArgs extends any[], TResult> = ((...args: TArgs) => TResult) & {
    mock: { calls: TArgs[] };
    mockImplementation(impl: (...args: TArgs) => TResult): void;
    mockReturnValue(value: TResult): void;
  };

  export const vi: {
    fn<TArgs extends any[], TResult>(impl?: (...args: TArgs) => TResult): MockFunction<TArgs, TResult>;
  };
}

declare module "vitest/config" {
  export function defineConfig<T>(config: T): T;
}
