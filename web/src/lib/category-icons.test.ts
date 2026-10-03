import { Tag, Utensils } from "lucide-react";
import { describe, expect, it } from "vitest";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
import { CATEGORY_ICONS, iconFor } from "./category-icons";

const DEFAULT_KEYS = ["utensils", "car", "home", "zap", "heart-pulse", "film", "repeat", "percent", "tag", "briefcase", "plus"];

describe("category icons", () => {
  it("covers every default category icon key", () => {
    const keys = CATEGORY_ICONS.map((i) => i.key);
    for (const k of DEFAULT_KEYS) expect(keys).toContain(k);
  });
  it("has 36–48 unique keys with labels in both locales", () => {
    const keys = CATEGORY_ICONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(36);
    expect(keys.length).toBeLessThanOrEqual(48);
    for (const { labelKey } of CATEGORY_ICONS) {
      const [ns, k] = labelKey.split(".");
      expect((es as unknown as Record<string, Record<string, string>>)[ns]?.[k]).toBeTruthy();
      expect((en as unknown as Record<string, Record<string, string>>)[ns]?.[k]).toBeTruthy();
    }
  });
  it("falls back to Tag", () => {
    expect(iconFor("utensils")).toBe(Utensils);
    expect(iconFor("nope")).toBe(Tag);
    expect(iconFor(undefined)).toBe(Tag);
  });
});
