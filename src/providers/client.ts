import { Client } from "@langchain/langgraph-sdk";

type ClientConstructor = new (config: { apiUrl: string; apiKey?: string }) => Client;

export function createClient(
  apiUrl: string,
  apiKey: string | undefined,
  clientCtor: ClientConstructor = Client,
) {
  return new clientCtor({
    apiKey,
    apiUrl,
  });
}
