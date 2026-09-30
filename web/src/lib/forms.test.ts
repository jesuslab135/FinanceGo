import { describe, expect, it, vi } from "vitest";
import { applyApiError } from "./forms";
import { ApiError } from "./api/errors";

const t = (key: string) => `t:${key}`;

describe("applyApiError", () => {
  it("maps field errors onto the form with localized messages", () => {
    const setError = vi.fn();
    const fallback = vi.fn();
    applyApiError(
      new ApiError(422, "validation_failed", "x", { category_id: "does not exist", color: "must be a hex color such as #22c55e" }),
      setError, fallback, t,
    );
    expect(setError).toHaveBeenCalledWith("category_id", { type: "server", message: "t:errors.fieldNotFound" });
    expect(setError).toHaveBeenCalledWith("color", { type: "server", message: "t:errors.fieldInvalid" });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back to a localized toast for non-field errors", () => {
    const setError = vi.fn();
    const fallback = vi.fn();
    applyApiError(new ApiError(409, "plan_locked", "installments already billed"), setError, fallback, t);
    applyApiError(new TypeError("Failed to fetch"), setError, fallback, t);
    expect(fallback).toHaveBeenNthCalledWith(1, "t:errors.plan_locked");
    expect(fallback).toHaveBeenNthCalledWith(2, "t:errors.network");
    expect(setError).not.toHaveBeenCalled();
  });
});
