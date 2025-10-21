import { v4 as uuidv4 } from "uuid";
import { Message, ToolMessage } from "@langchain/langgraph-sdk";

export const DO_NOT_RENDER_ID_PREFIX = "do-not-render-";

export function ensureToolCallsHaveResponses(
  messages: Message[],
  generateId: () => string = uuidv4,
): Message[] {
  const augmentedMessages: Message[] = [];
  let mutated = false;

  messages.forEach((message, index) => {
    augmentedMessages.push(message);

    if (message.type !== "ai" || message.tool_calls?.length === 0) {
      return;
    }

    const followingMessage = messages[index + 1];
    if (followingMessage && followingMessage.type === "tool") {
      return;
    }

    const syntheticMessages: ToolMessage[] = message.tool_calls.map((tc) => ({
      type: "tool" as const,
      tool_call_id: tc.id ?? "",
      id: `${DO_NOT_RENDER_ID_PREFIX}${generateId()}`,
      name: tc.name,
      content: "Successfully handled tool call.",
    }));

    if (syntheticMessages.length > 0) {
      mutated = true;
      augmentedMessages.push(...syntheticMessages);
    }
  });

  return mutated ? augmentedMessages : messages;
}
