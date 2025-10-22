import { describe, expect, it } from "vitest";

import {
  baseMessageObject,
  constructOpenInStudioURL,
  createDefaultHumanResponse,
  haveArgsChanged,
  isArrayOfMessages,
  prettifyText,
  unknownToPrettyDate,
} from "@/components/thread/agent-inbox/utils";

describe("agent inbox utils", () => {
  it("formats snake case text", () => {
    expect(prettifyText("example_action")).toBe("Example Action");
  });

  it("detects arrays of messages", () => {
    const valid = [
      {
        id: "1",
        type: "human",
        content: "hi",
        additional_kwargs: {},
      },
    ];
    const invalid = [{ no: "message" }];

    expect(isArrayOfMessages(valid as any)).toBe(true);
    expect(isArrayOfMessages(invalid as any)).toBe(false);
  });

  it("stringifies base message objects", () => {
    const output = baseMessageObject({
      type: "ai",
      content: "hello",
      additional_kwargs: {},
      tool_calls: [{ id: "1", name: "lookup" }],
    });

    expect(output.includes("ai: hello")).toBe(true);
    expect(output.includes("Tool calls")).toBe(true);
  });

  it("parses dates when provided", () => {
    const date = new Date("2024-01-01T12:00:00Z");
    const formatted = unknownToPrettyDate(date);
    expect(typeof formatted).toBe("string");
    expect((formatted ?? "").includes("01/01/2024")).toBe(true);
    expect(unknownToPrettyDate("invalid") === undefined).toBe(true);
  });

  it("creates default human responses respecting config", () => {
    const interrupt = {
      config: {
        allow_edit: true,
        allow_accept: true,
        allow_respond: true,
        allow_ignore: true,
      },
      action_request: {
        args: {
          text: "hello",
          count: 1,
        },
      },
    } as any;
    const ref = { current: {} as Record<string, string> };

    const result = createDefaultHumanResponse(interrupt, ref);

    expect(result.responses.some((r) => r.type === "edit")).toBe(true);
    expect(result.responses.some((r) => r.type === "response")).toBe(true);
    expect(result.responses.some((r) => r.type === "ignore")).toBe(true);
    expect(result.defaultSubmitType).toBe("accept");
    expect(result.hasAccept).toBe(true);
    expect(ref.current.text).toBe("hello");
  });

  it("builds smith studio url", () => {
    const url = constructOpenInStudioURL("https://example.dev/", "thread-123");
    expect(url.includes("thread/thread-123")).toBe(true);
    expect(url.includes("baseUrl=https%3A%2F%2Fexample.dev")).toBe(true);
  });

  it("detects changed args", () => {
    const initial = { text: "hello", count: "1" };
    expect(haveArgsChanged({ text: "hello", count: 1 }, initial)).toBe(false);
    expect(haveArgsChanged({ text: "updated", count: 1 }, initial)).toBe(true);
  });
});
