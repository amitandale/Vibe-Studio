// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DO_NOT_RENDER_ID_PREFIX,
  ensureToolCallsHaveResponses,
} from "@/lib/ensure-tool-responses";

describe("ensureToolCallsHaveResponses", () => {
  it("returns no additional messages for non-ai inputs", () => {
    const messages = [
      { id: "1", type: "human", content: "hi" },
      { id: "2", type: "system", content: "hello" },
    ] as any[];

    expect(ensureToolCallsHaveResponses(messages)).toEqual([]);
  });

  it("leaves ai messages followed by tool responses unchanged", () => {
    const messages = [
      {
        id: "1",
        type: "ai",
        content: "",
        tool_calls: [{ id: "call-1", name: "search" }],
      },
      {
        id: "2",
        type: "tool",
        tool_call_id: "call-1",
        content: "done",
      },
    ] as any[];

    expect(ensureToolCallsHaveResponses(messages)).toEqual([]);
  });

  it("synthesizes tool responses when missing", () => {
    const messages = [
      {
        id: "1",
        type: "ai",
        content: "",
        tool_calls: [{ id: "call-1", name: "search" }],
      },
    ] as any[];

    const result = ensureToolCallsHaveResponses(messages);

    expect(result.length).toBe(1);
    expect(result[0].tool_call_id).toBe("call-1");
    expect(result[0].name).toBe("search");
    expect(result[0].content).toBe("Successfully handled tool call.");
    expect(result[0].id.startsWith(DO_NOT_RENDER_ID_PREFIX)).toBe(true);
  });

  it("generates ordered tool messages for multiple calls", () => {
    const messages = [
      {
        id: "1",
        type: "ai",
        content: "",
        tool_calls: [
          { id: "call-1", name: "alpha" },
          { id: "call-2", name: "beta" },
        ],
      },
    ] as any[];

    const result = ensureToolCallsHaveResponses(messages);

    expect(result.length).toBe(2);
    expect(result[0].tool_call_id).toBe("call-1");
    expect(result[0].name).toBe("alpha");
    expect(result[1].tool_call_id).toBe("call-2");
    expect(result[1].name).toBe("beta");
    expect(result[0].id.startsWith(DO_NOT_RENDER_ID_PREFIX)).toBe(true);
    expect(result[1].id.startsWith(DO_NOT_RENDER_ID_PREFIX)).toBe(true);
  });
});
