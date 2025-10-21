export type ToastCall = { type: string; args: unknown[] };

const calls: ToastCall[] = [];

function record(type: string, args: unknown[]) {
  calls.push({ type, args });
}

export const toast = {
  error: (...args: unknown[]) => record("error", args),
  success: (...args: unknown[]) => record("success", args),
  info: (...args: unknown[]) => record("info", args),
  warning: (...args: unknown[]) => record("warning", args),
  get calls() {
    return calls;
  },
  reset() {
    calls.length = 0;
  },
};
