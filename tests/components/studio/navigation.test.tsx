import { describe, expect, it } from "vitest";
import { getSidebarNavItems } from "@/components/studio/Sidebar";
import { getNewRunHref, getVpsStatusColor } from "@/components/studio/Topbar";

describe("project-scoped navigation helpers", () => {
  it("exposes root-scoped sidebar links", () => {
    const items = getSidebarNavItems();
    const hrefs = items.map((item) => item.href);

    expect(hrefs.includes("/")).toBe(true);
    expect(hrefs.includes("/specs")).toBe(true);
    expect(hrefs.includes("/settings")).toBe(true);
  });

  it("exposes a root-relative new run link", () => {
    expect(getNewRunHref()).toBe("/specs/new");
  });

  it("maps VPS status to badge colors", () => {
    expect(getVpsStatusColor("ONLINE")).toBe("bg-emerald-400");
    expect(getVpsStatusColor("DEGRADED")).toBe("bg-amber-400");
    expect(getVpsStatusColor("OFFLINE")).toBe("bg-rose-400");
  });
});
