import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { ApiError } from "./errors";

/** API error codes that have their own message under the `errors` namespace. */
const KNOWN_CODES = new Set([
  "invalid_credentials", "email_taken", "category_exists", "category_in_use", "payment_method_in_use",
  "plan_locked", "month_out_of_range", "rate_limited", "not_a_credit_card", "invalid_reference",
  "validation_failed", "payload_too_large", "not_found", "unauthorized", "bad_request", "internal",
]);

/** Full message key (e.g. `errors.plan_locked`) for anything thrown by an API call. */
export function errorMessageKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (KNOWN_CODES.has(err.code)) return `errors.${err.code}`;
    return err.status >= 500 ? "errors.internal" : "errors.generic";
  }
  // fetch rejects with a TypeError when the server can't be reached.
  if (err instanceof TypeError) return "errors.network";
  return "errors.generic";
}

/** Server field messages (English, from the Go validators) mapped to localized keys. */
const FIELD_MESSAGES: Record<string, string> = {
  "is required": "validation.required",
  "does not exist": "errors.fieldNotFound",
  "must be exactly 4 digits": "validation.last4",
  "must be between 2 and 48": "validation.installments",
  "must be at most 200 characters": "validation.max200",
  "must be between 1 and 31": "validation.day",
  "is required for credit cards (1-31)": "validation.day",
  "must be 8-128 characters": "validation.min8",
  "must be a valid email address": "validation.email",
  "must not contain a card number": "errors.fieldCardNumber",
  "must not be before start_month": "validation.endBeforeStart",
  "must be between 1 and 999999999999 cents": "validation.amount",
  "must be at least one cent per installment": "validation.amount",
  "is incorrect": "errors.passwordIncorrect",
};

/** Localized key for a server field message; unknown messages become a generic "invalid value". */
export function fieldMessageKey(message: string): string {
  return FIELD_MESSAGES[message] ?? "errors.fieldInvalid";
}

export type Translate = (key: string) => string;

/** Localizes every message of an ApiError's `fields` map (for forms that keep errors in local state). */
export function localizeFields(fields: Record<string, string>, t: Translate): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([field, message]) => [field, t(fieldMessageKey(message))]));
}

/** Returns a function that turns any thrown error into a localized, user-facing message. */
export function useErrorMessage(): (err: unknown) => string {
  const t = useTranslations();
  return useCallback((err: unknown) => t(errorMessageKey(err)), [t]);
}
