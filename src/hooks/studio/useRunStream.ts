"use client";

import { useEffect, useMemo, useState } from "react";
import type { RunStreamEvent } from "@/lib/api/types";
import { useAgentApi } from "@/providers/studio/StudioProvider";

export interface RunStreamState {
  events: RunStreamEvent[];
  statusEvent?: RunStreamEvent;
  lastEventId?: string;
  error?: unknown;
}

export function useRunStream(runId: string | null, enabled = true): RunStreamState {
  const { streamRun } = useAgentApi();
  const [state, setState] = useState<RunStreamState>({ events: [] });

  useEffect(() => {
    if (!runId || !enabled) {
      setState({ events: [] });
      return;
    }
    const abortController = new AbortController();

    const unsubscribe = streamRun(
      runId,
      (event) => {
        setState((prev) => mergeEvent(prev, event));
      },
      {
        signal: abortController.signal,
        onError: (error) => {
          setState((prev) => ({ ...prev, error }));
        },
      },
    );

    return () => {
      abortController.abort();
      unsubscribe();
    };
  }, [runId, enabled, streamRun]);

  return useMemo(() => state, [state]);
}

function mergeEvent(prev: RunStreamState, incoming: RunStreamEvent): RunStreamState {
  const events = insertOrdered(prev.events, incoming);
  const statusEvent = incoming.type === "status" ? incoming : prev.statusEvent;
  return {
    events,
    statusEvent,
    lastEventId: incoming.id ?? prev.lastEventId,
    error: prev.error,
  };
}

export function insertOrdered(events: RunStreamEvent[], incoming: RunStreamEvent): RunStreamEvent[] {
  const existingIndex = events.findIndex((event) => event.id === incoming.id);
  if (existingIndex >= 0) {
    const updated = events.slice();
    updated[existingIndex] = incoming;
    return updated;
  }

  const next = [...events, incoming];
  return next.sort((a, b) => {
    if (typeof a.sequence === "number" && typeof b.sequence === "number") {
      return a.sequence - b.sequence;
    }
    return a.created_at.localeCompare(b.created_at);
  });
}
