import { describe, expect, it } from "vitest";
import { defaultCard, emptyRecents, orderCategories, recordUse } from "./recents";

describe("recents", () => {
  it("keeps most recent first, unique, max 12", () => {
    let r = emptyRecents;
    for (let i = 1; i <= 14; i++) r = recordUse(r, i, null);
    r = recordUse(r, 5, 9);
    expect(r.categories[0]).toBe(5);
    expect(r.categories).toHaveLength(12);
    expect(new Set(r.categories).size).toBe(12);
  });
  it("remembers the card per category and globally", () => {
    const r = recordUse(recordUse(emptyRecents, 1, 7), 2, null);
    expect(defaultCard(r, 1)).toBe(7);
    expect(defaultCard(r, 3)).toBe(null);
    expect(defaultCard(recordUse(emptyRecents, 4, 8), 99)).toBe(8);
  });
  it("orders recent categories first (top 6) then the rest", () => {
    const cats = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id }));
    expect(orderCategories(cats, [7, 3]).map((c) => c.id)).toEqual([7, 3, 1, 2, 4, 5, 6, 8]);
    expect(orderCategories(cats, [99]).map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
