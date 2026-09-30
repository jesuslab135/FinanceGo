import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateFinance } from "./hooks";

describe("invalidateFinance", () => {
  it("invalidates every finance query but keeps the profile", async () => {
    const qc = new QueryClient();
    for (const k of [["me"], ["summary", "2026-03"], ["expenses", {}], ["statement", 1, null], ["categories"]]) {
      qc.setQueryData(k, { x: 1 });
    }
    await invalidateFinance(qc);
    const stale = qc.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => q.queryKey[0]);
    expect(stale.sort()).toEqual(["categories", "expenses", "statement", "summary"]);
  });
});
