import type { Entry } from "@/lib/api/types";

export type EntryAction = { key: "markPaid" | "markReceived" | "skip" | "undo"; status: "pending" | "paid" | "received" | "skipped" };

export function entryActions(e: Entry): EntryAction[] {
  if (e.status !== "pending") return [{ key: "undo", status: "pending" }];
  return e.kind === "income"
    ? [{ key: "markReceived", status: "received" }, { key: "skip", status: "skipped" }]
    : [{ key: "markPaid", status: "paid" }, { key: "skip", status: "skipped" }];
}
