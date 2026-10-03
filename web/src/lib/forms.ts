import type { UseFormSetError } from "react-hook-form";
import { ApiError } from "./api/errors";
import { errorMessageKey, fieldMessageKey, type Translate } from "./api/error-messages";

/**
 * Puts server field errors under their inputs; everything else goes to `fallback` (a toast).
 * Messages are localized through `t` (the root translator): the server's English text is never shown.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyApiError(err: unknown, setError: UseFormSetError<any>, fallback: (msg: string) => void, t: Translate) {
  if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
    for (const [field, message] of Object.entries(err.fields)) setError(field, { type: "server", message: t(fieldMessageKey(message)) });
    return;
  }
  fallback(t(errorMessageKey(err)));
}
