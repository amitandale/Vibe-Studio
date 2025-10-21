export interface UIMessage {
  id: string;
  type: "ui" | string;
  content?: unknown;
}

export interface RemoveUIMessage {
  id: string;
  type: "remove" | string;
}

export function uiMessageReducer(
  state: UIMessage[],
  event: UIMessage | RemoveUIMessage,
) {
  if (isRemoveUIMessage(event)) {
    return state.filter((msg) => msg.id !== event.id);
  }
  if (isUIMessage(event)) {
    const existingIndex = state.findIndex((msg) => msg.id === event.id);
    if (existingIndex >= 0) {
      const copy = state.slice();
      copy[existingIndex] = event;
      return copy;
    }
    return [...state, event];
  }
  return state;
}

export function isUIMessage(event: unknown): event is UIMessage {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as { type?: unknown }).type === "ui"
  );
}

export function isRemoveUIMessage(event: unknown): event is RemoveUIMessage {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as { type?: unknown }).type === "remove"
  );
}
