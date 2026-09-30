import type { Session } from "./types";
import { tokenStore } from "./token-store";
import { setSessionHint } from "@/lib/auth/session-hint";

function apiOrigin(): string {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

let inflight: Promise<Session | null> | null = null;

/** Exchanges the HttpOnly refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<Session | null> {
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch(
          new Request(`${apiOrigin()}/api/v1/auth/refresh`, { method: "POST", credentials: "include" }),
        );
        if (!res.ok) throw new Error(`refresh ${res.status}`);
        const s = (await res.json()) as Session;
        tokenStore.set(s.access_token ?? null);
        setSessionHint(true);
        return s;
      } catch {
        tokenStore.set(null);
        setSessionHint(false);
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
  const res = await fetch(withAuth(input));
  if (res.status !== 401 || new URL(input.url).pathname.startsWith("/api/v1/auth/")) return res;
  const session = await refreshSession();
  if (!session) return res;
  return fetch(withAuth(retry));
}
