import type { UseFormSetError } from "react-hook-form";
import { ApiError } from "./api/errors";

/** Puts server field errors under their inputs; everything else goes to `fallback` (a toast). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyApiError(err: unknown, setError: UseFormSetError<any>, fallback: (msg: string) => void) {
  if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
    for (const [field, message] of Object.entries(err.fields)) setError(field, { type: "server", message });
    return;
  }
  fallback(err instanceof Error ? err.message : String(err));
}
