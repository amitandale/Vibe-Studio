export interface PassthroughConfig {
  apiUrl: string;
  apiKey: string | undefined;
  runtime: "edge";
}

export interface PassthroughEnv {
  LANGGRAPH_API_URL?: string;
  LANGSMITH_API_KEY?: string;
  [key: string]: string | undefined;
}

export function resolvePassthroughConfig(
  env: PassthroughEnv = process.env,
): PassthroughConfig {
  return {
    apiUrl: env.LANGGRAPH_API_URL ?? "remove-me",
    apiKey: env.LANGSMITH_API_KEY ?? "remove-me",
    runtime: "edge",
  };
}
