export interface PassthroughConfig {
  apiUrl: string;
  apiKey: string | undefined;
  runtime: "edge";
}

export function resolvePassthroughConfig(
  env: NodeJS.ProcessEnv = process.env,
): PassthroughConfig {
  return {
    apiUrl: env.LANGGRAPH_API_URL ?? "remove-me",
    apiKey: env.LANGSMITH_API_KEY ?? "remove-me",
    runtime: "edge",
  };
}
