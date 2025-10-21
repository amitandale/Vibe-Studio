// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { MutableRefObject } from "react";

import {
  baseMessageObject,
  constructOpenInStudioURL,
  createDefaultHumanResponse,
  haveArgsChanged,
  isArrayOfMessages,
  prettifyText,
  unknownToPrettyDate,
} from "@/components/thread/agent-inbox/utils";
import type { HumanInterrupt } from "@langchain/langgraph/prebuilt";

describe("agent inbox utils", () => {
  it("converts snake_case strings into start case", () => {
    expect(prettifyText("review_agent_action")).toBe("Review Agent Action");
  });

  it("detects when a value is an array of messages", () => {
    const messages = [
      {
        id: "1",
        type: "human",
        content: "hello",
        name: undefined,
        additional_kwargs: {},
      },
    ];

    expect(isArrayOfMessages(messages as unknown as Record<string, any>[])).toBe(
      true,
    );
    expect(isArrayOfMessages([{ not: "a message" }])).toBe(false);
  });

  it("formats base message like objects into readable strings", () => {
    const message = {
      id: "2",
      type: "ai",
      content: "world",
      name: undefined,
      additional_kwargs: {},
    };

    expect(baseMessageObject(message)).toBe("ai: world");
    expect(baseMessageObject({ type: "tool", content: "ok" })).toBe("tool: ok");
  });

  it("returns a formatted date string when parsing succeeds", () => {
    const date = new Date("2024-04-01T12:00:00Z");
    expect(unknownToPrettyDate(date)).toBe("04/01/2024 12:00 PM");
    expect(unknownToPrettyDate("not a date")).toBe(undefined);
  });

  it("builds default human responses and detects edits", () => {
    const interrupt = {
      config: {
        allow_edit: true,
        allow_accept: true,
        allow_respond: true,
        allow_ignore: true,
      },
      action_request: {
        name: "update_user",
        args: { name: "Alice", active: true },
      },
    } as unknown as HumanInterrupt;
    const initialValues = {
      current: {},
    } as MutableRefObject<Record<string, string>>;

    const { responses, defaultSubmitType, hasAccept } =
      createDefaultHumanResponse(interrupt, initialValues);

    expect(responses.map((r) => r.type)).toEqual([
      "edit",
      "response",
      "ignore",
      "accept",
    ]);
    expect(defaultSubmitType).toBe("accept");
    expect(hasAccept).toBe(true);

    expect(
      haveArgsChanged(
        { name: "Alice", active: true },
        initialValues.current,
      ),
    ).toBe(false);
    expect(
      haveArgsChanged(
        { name: "Bob", active: true },
        initialValues.current,
      ),
    ).toBe(true);
  });

  it("constructs the open in studio URL with base and thread id", () => {
    expect(
      constructOpenInStudioURL("https://example.com/", "thread-123"),
    ).toBe(
      "https://smith.langchain.com/studio/thread/thread-123?baseUrl=https%3A%2F%2Fexample.com",
    );
  });
});
