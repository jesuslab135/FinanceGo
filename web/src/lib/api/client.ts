import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { authFetch } from "./fetcher";
import { toApiError } from "./errors";

const baseUrl = `${typeof window === "undefined" ? "http://localhost" : window.location.origin}/api/v1`;

export const api = createClient<paths>({ baseUrl, fetch: authFetch, credentials: "include" });

/** Resolves to data or throws ApiError (so TanStack Query sees failures). */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (!response.ok) throw toApiError(response.status, error);
  return data as T;
}

export { ApiError } from "./errors";
export { tokenStore } from "./token-store";
export { refreshSession } from "./fetcher";
