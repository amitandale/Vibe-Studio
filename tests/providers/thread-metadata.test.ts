import { describe, expect, it } from "vitest";

import { getThreadSearchMetadata } from "@/providers/Thread";

describe("getThreadSearchMetadata", () => {
  it("returns assistant metadata when id is a uuid", () => {
    expect(
      getThreadSearchMetadata("550e8400-e29b-41d4-a716-446655440000"),
    ).toEqual({ assistant_id: "550e8400-e29b-41d4-a716-446655440000" });
  });

  it("returns graph metadata when id is not a uuid", () => {
    expect(getThreadSearchMetadata("graph-alpha")).toEqual({
      graph_id: "graph-alpha",
    });
  });
});
