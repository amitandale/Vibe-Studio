import { describe, expect, it } from "vitest";

import { getThreadSearchMetadata } from "@/providers/Thread";

describe("getThreadSearchMetadata", () => {
  it("returns assistant_id when the value is a uuid", () => {
    const metadata = getThreadSearchMetadata("550e8400-e29b-41d4-a716-446655440000");
    expect(metadata).toEqual({ assistant_id: "550e8400-e29b-41d4-a716-446655440000" });
  });

  it("returns graph_id for non-uuid values", () => {
    const metadata = getThreadSearchMetadata("my-agent");
    expect(metadata).toEqual({ graph_id: "my-agent" });
  });
});
