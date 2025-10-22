import { Client } from "@langchain/langgraph-sdk";

export interface ClientOptions {
  apiUrl: string;
  apiKey: string | undefined;
}

export function createClientOptions(
  apiUrl: string,
  apiKey: string | undefined,
): ClientOptions {
  return { apiUrl, apiKey };
}

export function createClient(apiUrl: string, apiKey: string | undefined) {
  return new Client(createClientOptions(apiUrl, apiKey));
}
