import type { Session } from "./types";
import { tokenStore } from "./token-store";
import { setSessionHint } from "@/lib/auth/session-hint";

function apiOrigin(): string {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

let inflight: Promise<Session | null> | null = null;

const REFRESH_RACE_DELAY_MS = 300;

function refreshRequest(): Request {
  return new Request(`${apiOrigin()}/api/v1/auth/refresh`, { method: "POST", credentials: "include" });
}

/**
 * Exchanges the HttpOnly refresh cookie for a new access token. Concurrent callers share one request.
 * Only a 401/403 means "no session" (clears token and hint); transient failures leave state unchanged.
 */
export function refreshSession(): Promise<Session | null> {
  if (!inflight) {
    inflight = (async () => {
      try {
        let res = await fetch(refreshRequest());
        if (res.status === 401) {
          // Another tab rotated the token a moment ago; the browser now holds the new cookie.
          const body = (await res.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
          if (body?.error?.code === "refresh_race") {
            await new Promise((r) => setTimeout(r, REFRESH_RACE_DELAY_MS));
            res = await fetch(refreshRequest());
          }
        }
        if (res.status === 401 || res.status === 403) {
          tokenStore.set(null);
          setSessionHint(false);
          return null;
        }
        if (!res.ok) return null;
        const s = (await res.json()) as Session;
        tokenStore.set(s.access_token ?? null);
        setSessionHint(true);
        return s;
      } catch {
        return null;
      } finally {
        setTimeout(() => (inflight = null), 0);
      }
    })();
  }
  return inflight;
}

export function __resetRefreshForTests() {
  inflight = null;
}

function withAuth(req: Request): Request {
  const headers = new Headers(req.headers);
  const t = tokenStore.get();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  return new Request(req, { headers, credentials: "include" });
}

/** fetch for openapi-fetch: bearer token, cookies, and one refresh-and-retry on 401. */
export async function authFetch(input: Request): Promise<Response> {
  const retry = input.clone();
  const sent = tokenStore.get();
  const res = await fetch(withAuth(input));
  if (res.status !== 401 || new URL(input.url).pathname.startsWith("/api/v1/auth/")) return res;
  // A refresh may already have completed while this request was in flight; then just retry.
  const current = tokenStore.get();
  if (current === null || current === sent) {
    const session = await refreshSession();
    if (!session) return res;
  }
  await res.body?.cancel();
  return fetch(withAuth(retry));
}
