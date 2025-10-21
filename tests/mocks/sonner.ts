type TrackingFunction = ((...args: unknown[]) => void) & {
  calls: unknown[][];
};

const createTrackingFunction = (): TrackingFunction => {
  const fn = ((...args: unknown[]) => {
    fn.calls.push(args);
  }) as TrackingFunction;
  fn.calls = [];
  return fn;
};

const createToast = () => {
  const toastFn = (() => {}) as TrackingFunction & {
    success: TrackingFunction;
    error: TrackingFunction;
    warning: TrackingFunction;
    info: TrackingFunction;
    message: TrackingFunction;
  };
  toastFn.calls = [];
  toastFn.success = createTrackingFunction();
  toastFn.error = createTrackingFunction();
  toastFn.warning = createTrackingFunction();
  toastFn.info = createTrackingFunction();
  toastFn.message = createTrackingFunction();
  return toastFn;
};

export const toast = createToast();
export const Toaster = () => null;
