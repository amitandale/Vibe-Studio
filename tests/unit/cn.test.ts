import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and removes duplicates", () => {
    expect(cn("px-2", "px-4", { hidden: false, block: true })).toBe("px-4 block");
  });

  it("handles falsy values", () => {
    expect(cn("text-base", undefined, null, "", false, "font-semibold")).toBe(
      "text-base font-semibold",
    );
  });
});
