const STORAGE_NAMESPACE = "vs";

function getScope(projectId: string): string {
  return `${STORAGE_NAMESPACE}:${projectId}`;
}

export function getProjectKey(projectId: string, key: string): string {
  return `${getScope(projectId)}:${key}`;
}

export function persistTraceId(projectId: string, traceId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const storageKey = getProjectKey(projectId, "trace");
  try {
    window.sessionStorage.setItem(storageKey, traceId);
  } catch (error) {
    console.warn("Unable to persist trace id in sessionStorage", error);
  }
  try {
    window.localStorage.setItem(storageKey, traceId);
  } catch (error) {
    console.warn("Unable to persist trace id in localStorage", error);
  }
}

export function readTraceId(projectId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const storageKey = getProjectKey(projectId, "trace");
  try {
    return window.sessionStorage.getItem(storageKey) ?? window.localStorage.getItem(storageKey);
  } catch (error) {
    console.warn("Unable to read trace id", error);
    return null;
  }
}
