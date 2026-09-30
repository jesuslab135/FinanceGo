import { describe, expect, it, vi } from "vitest";
import { applyApiError } from "./forms";
import { ApiError } from "./api/errors";

describe("applyApiError", () => {
  it("maps field errors onto the form", () => {
    const setError = vi.fn();
    const fallback = vi.fn();
    applyApiError(new ApiError(422, "invalid_reference", "x", { category_id: "does not exist" }), setError, fallback);
    expect(setError).toHaveBeenCalledWith("category_id", { type: "server", message: "does not exist" });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back to a toast for non-field errors", () => {
    const setError = vi.fn();
    const fallback = vi.fn();
    applyApiError(new ApiError(409, "plan_locked", "installments already billed"), setError, fallback);
    applyApiError(new Error("network"), setError, fallback);
    expect(fallback).toHaveBeenNthCalledWith(1, "installments already billed");
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(setError).not.toHaveBeenCalled();
  });
});
