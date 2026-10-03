import { describe, expect, it } from "vitest";
import es from "../../messages/es.json";
import en from "../../messages/en.json";

function keys(o: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("messages", () => {
  it("es and en define exactly the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });
});
