import { initApiPassthrough } from "langgraph-nextjs-api-passthrough";

// This file acts as a proxy for requests to your LangGraph server.
// Read the [Going to Production](https://github.com/langchain-ai/agent-chat-ui?tab=readme-ov-file#going-to-production) section
// for more information.

export type ApiPassthroughInitializer = typeof initApiPassthrough;

export function createPassthroughHandlers(
  initializer: ApiPassthroughInitializer = initApiPassthrough,
  env: NodeJS.ProcessEnv = process.env,
) {
  return initializer({
    apiUrl: env.LANGGRAPH_API_URL ?? "remove-me", // default, if not defined it will attempt to read process.env.LANGGRAPH_API_URL
    apiKey: env.LANGSMITH_API_KEY ?? "remove-me", // default, if not defined it will attempt to read process.env.LANGSMITH_API_KEY
    runtime: "edge", // default
  });
}

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS, runtime } =
  createPassthroughHandlers();
