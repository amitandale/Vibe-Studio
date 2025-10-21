import { useMemo, useRef, useState } from "react";

export interface UseStreamOptions<State> {
  apiUrl: string;
  apiKey?: string;
  assistantId: string;
  threadId: string | null;
  fetchStateHistory?: boolean;
  onCustomEvent?: (
    event: unknown,
    helpers: { mutate: (fn: (prev: State) => State) => void },
  ) => void;
  onThreadId?: (id: string) => void;
}

export function useStream<State = unknown, EventShape = unknown>(
  options: UseStreamOptions<State> & EventShape,
) {
  const [state, setState] = useState<State>({} as State);
  const pendingRef = useRef(false);

  const mutate = useMemo(
    () =>
      (updater: (prev: State) => State) => {
        setState((prev) => updater(prev));
      },
    [],
  );

  return {
    state,
    pending: pendingRef.current,
    mutate,
    options,
  };
}
