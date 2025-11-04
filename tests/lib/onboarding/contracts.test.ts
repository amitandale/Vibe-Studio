import { afterEach, describe, expect, it, vi } from "vitest";
import { loadOnboardingContracts } from "@/lib/onboarding/contracts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const yamlSource = readFileSync(resolve(process.cwd(), "public/schemas/onboarding.yaml"), "utf8");
const originalFetch = globalThis.fetch;

describe("loadOnboardingContracts", () => {
  afterEach(() => {
    if (originalFetch) {
      (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
  });

  it("parses tool schemas from YAML", async () => {
    const baseUrl = "https://mcp-contracts.test";
    const fetchMock = vi.fn<[string, RequestInit?], Promise<{ ok: boolean; status: number; text: () => Promise<string> }>>();
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => yamlSource });
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    const contracts = await loadOnboardingContracts(baseUrl, fetchMock);
    const specContract = contracts.tools["wizard/spec_chat"];
    const parsed = specContract.inputSchema.parse({
      project_id: "demo",
      trace_id: "trace-1",
      conversation: [],
      message: "hello",
    }) as unknown as { project_id: string };
    expect(parsed.project_id).toBe("demo");
    expect(specContract.outputSchema.safeParse({ messages: [] }).success).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(1);
    expect(fetchMock.mock.calls[0]).toEqual([`${baseUrl}/schemas/onboarding.yaml`, { cache: "no-store" }]);
  });

  it("caches contracts for subsequent calls", async () => {
    const baseUrl = "https://mcp-contracts-cache.test";
    const fetchMock = vi.fn<[string, RequestInit?], Promise<{ ok: boolean; status: number; text: () => Promise<string> }>>();
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => yamlSource });
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    const first = await loadOnboardingContracts(baseUrl, fetchMock);
    const second = await loadOnboardingContracts(baseUrl, fetchMock);
    expect(first.tools["wizard/pr_dashboard"]).toBeTruthy();
    expect(second.tools["wizard/pr_dashboard"]).toBeTruthy();
    expect(fetchMock.mock.calls.length).toBe(1);
  });
});
