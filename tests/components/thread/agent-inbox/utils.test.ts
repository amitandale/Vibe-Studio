// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  hasSubmitType,
  hasUserChangedArgs,
  prettifyText,
} from "@/components/thread/agent-inbox/utils";
import type { HumanResponseWithEdits } from "@/components/thread/agent-inbox/types";
import type { ActionRequest } from "@langchain/langgraph/prebuilt";

describe("agent inbox utils", () => {
  it("converts snake_case strings into start case", () => {
    expect(prettifyText("review_agent_action")).toBe("Review Agent Action");
  });

  it("detects when the user has changed primitive or structured args", () => {
    const initialValues = {
      name: "Alice",
      payload: JSON.stringify({ active: true }, null),
    };

    expect(
      hasUserChangedArgs(
        {
          name: "Alice",
          payload: { active: true },
        },
        initialValues,
      ),
    ).toBe(false);

    expect(
      hasUserChangedArgs(
        {
          name: "Bob",
          payload: { active: true },
        },
        initialValues,
      ),
    ).toBe(true);
  });

  it("detects when a submit type is present", () => {
    const responses: HumanResponseWithEdits[] = [
      {
        type: "edit",
        args: { action: "edit", payload: { value: "foo" } } as unknown as ActionRequest,
      },
      { type: "response", args: "bar" },
    ];

    expect(hasSubmitType(responses, "edit")).toBe(true);
    expect(hasSubmitType(responses, "accept")).toBe(false);
  });
});
