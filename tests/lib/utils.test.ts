// @vitest-environment node
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges static classes", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("merges conditional class maps including only truthy entries", () => {
    expect(cn("foo", { bar: true, baz: false }, ["qux"]))
      .toBe("foo bar qux");
  });

  it("deduplicates conflicting utilities while preserving order", () => {
    expect(cn("px-2", "px-4", "text-sm", "text-sm")).toBe("px-4 text-sm");
  });
});
