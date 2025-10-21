export interface Thread {
  id: string;
  metadata?: Record<string, unknown>;
}

export type ToolCall = {
  id?: string;
  name: string;
};

export type Message = {
  type: "ai" | "tool" | "human" | string;
  tool_calls?: ToolCall[];
  content?: unknown;
  id?: string;
};

export type ToolMessage = Message & {
  type: "tool";
  tool_call_id: string;
  name?: string;
};

export class Client {
  config: { apiUrl: string; apiKey?: string };
  threads = {
    async search(_: unknown) {
      return [] as Thread[];
    },
  };

  constructor(config: { apiUrl: string; apiKey?: string }) {
    this.config = config;
  }
}
