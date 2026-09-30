import { describe, expect, it } from "vitest";
import { categoryForIcon, FIXED_SUGGESTIONS, needsOnboarding } from "./onboarding";

describe("needsOnboarding", () => {
  const base = { status: "authenticated" as const, incomeCount: 0, skipped: false, pathname: "/dashboard" };
  it("redirects a brand-new user", () => { expect(needsOnboarding(base)).toBe("redirect"); });
  it("never traps: already on /welcome, skipped, has income, still loading", () => {
    expect(needsOnboarding({ ...base, pathname: "/welcome" })).toBe("stay");
    expect(needsOnboarding({ ...base, skipped: true })).toBe("stay");
    expect(needsOnboarding({ ...base, incomeCount: 1 })).toBe("stay");
    expect(needsOnboarding({ ...base, incomeCount: undefined })).toBe("stay");
    expect(needsOnboarding({ ...base, status: "loading" })).toBe("stay");
    expect(needsOnboarding({ ...base, status: "anonymous" })).toBe("stay");
  });
  it("settings stays reachable even without income", () => {
    expect(needsOnboarding({ ...base, pathname: "/settings" })).toBe("stay");
    expect(needsOnboarding({ ...base, pathname: "/settings/profile" })).toBe("stay");
  });
  it("does not exempt look-alike routes", () => {
    expect(needsOnboarding({ ...base, pathname: "/welcomes" })).toBe("redirect");
  });
});

describe("categoryForIcon", () => {
  const cats = [{ id: 1, kind: "expense", icon: "utensils" }, { id: 2, kind: "expense", icon: "home" }, { id: 3, kind: "income", icon: "home" }] as never[];
  it("matches expense categories by icon, falls back to the first expense category", () => {
    expect(categoryForIcon(cats, "home")).toBe(2);
    expect(categoryForIcon(cats, "wifi")).toBe(1);
    expect(categoryForIcon([], "home")).toBeUndefined();
  });
});

describe("FIXED_SUGGESTIONS", () => {
  const seeded = [
    { id: 1, kind: "expense", icon: "utensils" }, { id: 2, kind: "expense", icon: "home" },
    { id: 3, kind: "expense", icon: "zap" }, { id: 4, kind: "expense", icon: "tag" },
  ] as never[];
  it("resolves water, internet and phone to the utilities (zap) category even though they display other icons", () => {
    for (const key of ["water", "internet", "phone"]) {
      const s = FIXED_SUGGESTIONS.find((x) => x.key === key)!;
      expect(categoryForIcon(seeded, s.categoryIcon)).toBe(3);
    }
    expect(FIXED_SUGGESTIONS.find((x) => x.key === "internet")!.icon).toBe("wifi");
    expect(FIXED_SUGGESTIONS.find((x) => x.key === "phone")!.icon).toBe("smartphone");
  });
});
