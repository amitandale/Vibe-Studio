// @vitest-environment node
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges static class names", () => {
    expect(cn("px-2", "px-4", "py-3")).toBe("px-4 py-3");
  });

  it("merges conditional classes when truthy", () => {
    expect(
      cn("text-base", { hidden: false, block: true, underline: 1, italic: 0 }),
    ).toBe("text-base block underline");
  });

  it("dedupes tailwind classes while preserving order", () => {
    expect(
      cn("text-sm", ["font-bold", { block: true }], "text-sm", "mt-2", "mt-0"),
    ).toBe("font-bold block text-sm mt-0");
  });
});
