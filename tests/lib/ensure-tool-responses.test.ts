import { describe, expect, it } from "vitest";

import {
  DO_NOT_RENDER_ID_PREFIX,
  createEnsureToolResponses,
} from "@/lib/ensure-tool-responses";

describe("ensureToolCallsHaveResponses", () => {
  let counter = 0;
  const ensure = createEnsureToolResponses(() => {
    counter += 1;
    return `uuid-${counter}`;
  });

  it("ignores non-AI messages", () => {
    expect(
      ensure([
        { type: "human" },
        { type: "tool" },
      ] as any),
    ).toEqual([]);
  });

  it("skips messages that already have tool responses", () => {
    const result = ensure([
      { type: "ai", tool_calls: [{ id: "1", name: "tool" }] },
      { type: "tool" },
    ] as any);
    expect(result).toEqual([]);
  });

  it("creates tool responses when missing", () => {
    const result = ensure([
      {
        type: "ai",
        tool_calls: [
          { id: "call-1", name: "weather" },
          { id: "call-2", name: "calendar" },
        ],
      },
    ] as any);

    expect(result).toEqual([
      {
        type: "tool",
        tool_call_id: "call-1",
        id: `${DO_NOT_RENDER_ID_PREFIX}uuid-1`,
        name: "weather",
        content: "Successfully handled tool call.",
      },
      {
        type: "tool",
        tool_call_id: "call-2",
        id: `${DO_NOT_RENDER_ID_PREFIX}uuid-2`,
        name: "calendar",
        content: "Successfully handled tool call.",
      },
    ]);
  });
});
