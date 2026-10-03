import { afterEach, describe, expect, it, vi } from "vitest";
import { readJSON, userKey, writeJSON } from "./storage";

describe("storage", () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  it("round-trips JSON under a user-scoped key", () => {
    writeJSON(userKey(7, "recents"), { a: 1 });
    expect(readJSON(userKey(7, "recents"), null)).toEqual({ a: 1 });
    expect(userKey(7, "recents")).toBe("fin:recents:7");
  });
  it("returns the fallback on missing, corrupt or throwing storage", () => {
    expect(readJSON("nope", 5)).toBe(5);
    localStorage.setItem("bad", "{");
    expect(readJSON("bad", 6)).toBe(6);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(readJSON("x", 7)).toBe(7);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => writeJSON("x", 1)).not.toThrow();
  });
});
