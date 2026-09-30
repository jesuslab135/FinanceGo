import { describe, expect, it } from "vitest";
import es from "../../../messages/es.json";
import en from "../../../messages/en.json";
import { errorMessageKey, fieldMessageKey } from "./error-messages";
import { ApiError } from "./errors";

const lookup = (messages: object, key: string) =>
  key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], messages);

describe("errorMessageKey", () => {
  it("maps known API codes to their own message", () => {
    expect(errorMessageKey(new ApiError(409, "payment_method_in_use", "payment method is used by 3 records"))).toBe("errors.payment_method_in_use");
    expect(errorMessageKey(new ApiError(429, "rate_limited", "too many requests"))).toBe("errors.rate_limited");
  });

  it("falls back by status for unknown codes and to network/generic for other errors", () => {
    expect(errorMessageKey(new ApiError(502, "bad_gateway", "HTTP 502"))).toBe("errors.internal");
    expect(errorMessageKey(new ApiError(418, "teapot", "x"))).toBe("errors.generic");
    expect(errorMessageKey(new TypeError("Failed to fetch"))).toBe("errors.network");
    expect(errorMessageKey("boom")).toBe("errors.generic");
  });

  it("never shows the server's English message", () => {
    for (const code of ["plan_locked", "category_exists", "month_out_of_range", "invalid_reference", "internal"]) {
      const key = errorMessageKey(new ApiError(409, code, "english text"));
      expect(lookup(es, key), key).toEqual(expect.any(String));
      expect(lookup(en, key), key).toEqual(expect.any(String));
    }
  });
});

describe("fieldMessageKey", () => {
  it("localizes known validator messages and hides the rest behind a generic message", () => {
    expect(fieldMessageKey("is required")).toBe("validation.required");
    expect(fieldMessageKey("does not exist")).toBe("errors.fieldNotFound");
    expect(fieldMessageKey("must be a hex color such as #22c55e")).toBe("errors.fieldInvalid");
  });

  it("points only at keys that exist in both languages", () => {
    const serverMessages = [
      "is required", "does not exist", "must be exactly 4 digits", "must be between 2 and 48", "must be at most 200 characters",
      "must be between 1 and 31", "is required for credit cards (1-31)", "must be 8-128 characters", "must be a valid email address",
      "must not contain a card number", "must not be before start_month", "must be between 1 and 999999999999 cents",
      "must be at least one cent per installment", "unknown",
    ];
    for (const key of serverMessages.map(fieldMessageKey)) {
      expect(lookup(es, key), key).toEqual(expect.any(String));
      expect(lookup(en, key), key).toEqual(expect.any(String));
    }
  });
});
