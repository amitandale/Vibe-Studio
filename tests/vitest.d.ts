declare module "vitest" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => unknown | Promise<unknown>): void;
  export function expect<T>(actual: T): {
    toBe(expected: T): void;
  };
}

declare module "vitest/config" {
  export function defineConfig<T>(config: T): T;
}
