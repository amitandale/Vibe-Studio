// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createDefaultHumanResponse,
  haveArgsChanged,
  prettifyText,
} from "@/components/thread/agent-inbox/utils";

describe("agent inbox utils", () => {
  it("prettifies snake_case strings", () => {
    expect(prettifyText("send_test_email")).toBe("Send Test Email");
  });

  it("detects when user arguments differ", () => {
    const initial = {
      message: "Hello",
      count: "1",
      payload: JSON.stringify({ foo: "bar" }),
    };

    expect(
      haveArgsChanged(
        { message: "Hello", count: 1, payload: { foo: "bar" } },
        initial,
      ),
    ).toBe(false);

    expect(
      haveArgsChanged(
        { message: "Hello", count: 2, payload: { foo: "bar" } },
        initial,
      ),
    ).toBe(true);
  });

  it("builds responses that reflect allowed submit types", () => {
    const interrupt = {
      config: {
        allow_edit: true,
        allow_accept: true,
        allow_ignore: true,
        allow_respond: true,
      },
      action_request: {
        args: { topic: "news" },
      },
    } as any;

    const editRef = { current: {} } as any;

    const result = createDefaultHumanResponse(interrupt, editRef);

    expect(result.defaultSubmitType).toBe("accept");
    expect(result.hasAccept).toBe(true);
    expect(result.responses.map((r) => r.type)).toEqual([
      "edit",
      "response",
      "ignore",
      "accept",
    ]);
    expect(editRef.current.topic).toBe("news");
  });

  it("omits accept responses when not allowed", () => {
    const interrupt = {
      config: {
        allow_edit: true,
        allow_accept: false,
        allow_ignore: false,
        allow_respond: true,
      },
      action_request: {
        args: { value: 42 },
      },
    } as any;

    const editRef = { current: {} } as any;

    const result = createDefaultHumanResponse(interrupt, editRef);

    expect(result.defaultSubmitType).toBe("response");
    expect(result.hasAccept).toBe(false);
    expect(result.responses.map((r) => r.type)).toEqual(["edit", "response"]);
  });
});
