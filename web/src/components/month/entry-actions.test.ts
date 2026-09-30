import { describe, expect, it } from "vitest";
import type { Entry } from "@/lib/api/types";
import { entryActions } from "./entry-actions";

const e = (kind: string, status: string) => ({ id: 1, kind, status, amount: 1, name: "x", due_date: "2026-03-01", month: "2026-03" }) as Entry;

describe("entryActions", () => {
  it("pending income can be received or skipped", () => {
    expect(entryActions(e("income", "pending")).map((a) => a.key)).toEqual(["markReceived", "skip"]);
  });
  it("pending fixed/installment can be paid or skipped", () => {
    expect(entryActions(e("fixed", "pending")).map((a) => a.status)).toEqual(["paid", "skipped"]);
    expect(entryActions(e("installment", "pending")).map((a) => a.key)).toEqual(["markPaid", "skip"]);
  });
  it("settled or skipped rows can only be undone", () => {
    for (const [k, s] of [["income", "received"], ["fixed", "paid"], ["fixed", "skipped"]]) {
      expect(entryActions(e(k, s))).toEqual([{ key: "undo", status: "pending" }]);
    }
  });
});
