import { describe, it, expect } from "vitest";
import { insertOrdered } from "@/hooks/studio/useRunStream";
import type { RunStreamEvent } from "@/lib/api/types";

describe("insertOrdered", () => {
  it("keeps events sorted by sequence", () => {
    const events: RunStreamEvent[] = [];
    const second: RunStreamEvent = { id: "2", run_id: "run", sequence: 2, type: "log", payload: "second", created_at: "" };
    const first: RunStreamEvent = { id: "1", run_id: "run", sequence: 1, type: "log", payload: "first", created_at: "" };

    const afterFirst = insertOrdered(events, second);
    const afterSecond = insertOrdered(afterFirst, first);

    expect(afterSecond[0].id).toBe("1");
    expect(afterSecond[1].id).toBe("2");
  });
});
