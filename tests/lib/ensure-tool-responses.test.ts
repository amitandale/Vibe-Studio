// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ToolMessage } from "@langchain/langgraph-sdk";

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

    const result = ensureToolCallsHaveResponses(messages) as ToolMessage[];

    expect(result.length).toBe(1);
    const first = result[0]!;
    expect(first.tool_call_id).toBe("call-1");
    expect(first.name).toBe("search");
    expect(first.content).toBe("Successfully handled tool call.");
    const firstId = first.id ?? "";
    expect(firstId).not.toBe("");
    expect(firstId.startsWith(DO_NOT_RENDER_ID_PREFIX)).toBe(true);
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

    const result = ensureToolCallsHaveResponses(messages) as ToolMessage[];

    expect(result.length).toBe(2);
    const [first, second] = result;
    expect(first!.tool_call_id).toBe("call-1");
    expect(first!.name).toBe("alpha");
    expect(second!.tool_call_id).toBe("call-2");
    expect(second!.name).toBe("beta");
    const firstId = first!.id ?? "";
    const secondId = second!.id ?? "";
    expect(firstId).not.toBe("");
    expect(secondId).not.toBe("");
    expect(firstId.startsWith(DO_NOT_RENDER_ID_PREFIX)).toBe(true);
    expect(secondId.startsWith(DO_NOT_RENDER_ID_PREFIX)).toBe(true);
  });
});
