// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DO_NOT_RENDER_ID_PREFIX,
  ensureToolCallsHaveResponses,
} from "@/lib/ensure-tool-responses";
import type { Message } from "@langchain/langgraph-sdk";

describe("ensureToolCallsHaveResponses", () => {
  it("returns original array when no ai tool calls are present", () => {
    const messages: Message[] = [
      { id: "1", type: "human", content: "hello" },
      { id: "2", type: "system", content: "system" },
    ];

    const result = ensureToolCallsHaveResponses(messages);
    expect(result).toBe(messages);
  });

  it("returns original array when a tool response already follows", () => {
    const messages: Message[] = [
      {
        id: "ai-1",
        type: "ai",
        content: "",
        tool_calls: [
          {
            id: "tool-1",
            name: "weather",
            args: {},
          },
        ],
      },
      {
        id: "tool-msg-1",
        type: "tool",
        tool_call_id: "tool-1",
        content: "handled",
      },
    ];

    const result = ensureToolCallsHaveResponses(messages);
    expect(result).toBe(messages);
  });

  it("synthesizes tool responses when missing", () => {
    const generateId = (() => {
      let counter = 0;
      return () => `mock-uuid-${++counter}`;
    })();

    const messages: Message[] = [
      {
        id: "ai-1",
        type: "ai",
        content: "",
        tool_calls: [
          {
            id: "tool-1",
            name: "weather",
            args: {},
          },
          {
            id: "tool-2",
            name: "calendar",
            args: {},
          },
        ],
      },
    ];

    const result = ensureToolCallsHaveResponses(messages, generateId);

    expect(result.length).toBe(3);
    expect(result[0]).toEqual(messages[0]);
    const firstTool = result[1] as Message;
    const secondTool = result[2] as Message;

    expect(firstTool.type).toBe("tool");
    expect((firstTool as { tool_call_id: string }).tool_call_id).toBe("tool-1");
    expect((firstTool as { id: string }).id).toBe(
      `${DO_NOT_RENDER_ID_PREFIX}mock-uuid-1`,
    );
    expect((firstTool as { name?: string }).name).toBe("weather");
    expect((firstTool as { content?: string }).content).toBe(
      "Successfully handled tool call.",
    );

    expect(secondTool.type).toBe("tool");
    expect((secondTool as { tool_call_id: string }).tool_call_id).toBe(
      "tool-2",
    );
    expect((secondTool as { id: string }).id).toBe(
      `${DO_NOT_RENDER_ID_PREFIX}mock-uuid-2`,
    );
    expect((secondTool as { name?: string }).name).toBe("calendar");
    expect((secondTool as { content?: string }).content).toBe(
      "Successfully handled tool call.",
    );
  });
});
