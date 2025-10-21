declare module "@testing-library/react" {
  export type HookCallback<TResult> = () => TResult;
  export type HookResult<TResult> = {
    current: TResult;
  };
  export type RenderHookResult<TResult> = {
    result: HookResult<TResult>;
    rerender: (callback?: HookCallback<TResult>) => void;
    unmount: () => void;
  };
  export function renderHook<TResult>(callback: HookCallback<TResult>): RenderHookResult<TResult>;
  export function act(callback: () => void | Promise<void>): Promise<void> | void;
  export function cleanup(): void;
}
