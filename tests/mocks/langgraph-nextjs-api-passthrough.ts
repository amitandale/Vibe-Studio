export function initApiPassthrough(config: {
  apiUrl: string;
  apiKey?: string;
  runtime?: string;
}) {
  return {
    GET: async () => ({ config }),
    POST: async () => ({ config }),
    PUT: async () => ({ config }),
    PATCH: async () => ({ config }),
    DELETE: async () => ({ config }),
    OPTIONS: async () => ({ config }),
    runtime: config.runtime ?? "edge",
  };
}
