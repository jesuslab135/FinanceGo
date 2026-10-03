import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authFetch, refreshSession, __resetRefreshForTests } from "./fetcher";
import { tokenStore } from "./token-store";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("authFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    tokenStore.set(null);
    __resetRefreshForTests();
    document.cookie = "fin_session=; Max-Age=0; Path=/";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("attaches the bearer token and credentials", async () => {
    tokenStore.set("t1");
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await authFetch(new Request("http://x/api/v1/me"));
    const sent: Request = fetchMock.mock.calls[0][0];
    expect(sent.headers.get("Authorization")).toBe("Bearer t1");
    expect(sent.credentials).toBe("include");
  });

  it("single-flight: two 401s trigger one refresh and both retry", async () => {
    tokenStore.set("old");
    fetchMock.mockImplementation(async (req: Request) => {
      if (req.url.endsWith("/auth/refresh")) {
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { access_token: "new", user: { id: 1 } });
      }
      return req.headers.get("Authorization") === "Bearer new" ? json(200, { ok: true }) : json(401, {});
    });
    const [a, b] = await Promise.all([
      authFetch(new Request("http://x/api/v1/dashboard/summary")),
      authFetch(new Request("http://x/api/v1/expenses")),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const refreshCalls = fetchMock.mock.calls.filter(([r]) => (r as Request).url.endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
    expect(tokenStore.get()).toBe("new");
    expect(document.cookie).toContain("fin_session=1");
  });

  it("retries a POST with its body intact", async () => {
    tokenStore.set("old");
    const bodies: string[] = [];
    fetchMock.mockImplementation(async (req: Request) => {
      if (req.url.endsWith("/auth/refresh")) return json(200, { access_token: "new", user: { id: 1 } });
      bodies.push(await req.text());
      return req.headers.get("Authorization") === "Bearer new" ? json(201, {}) : json(401, {});
    });
    const res = await authFetch(new Request("http://x/api/v1/expenses", { method: "POST", body: '{"amount":1}' }));
    expect(res.status).toBe(201);
    expect(bodies).toEqual(['{"amount":1}', '{"amount":1}']);
  });

  it("failed refresh clears the token and the hint and returns the 401", async () => {
    tokenStore.set("old");
    document.cookie = "fin_session=1; Path=/";
    fetchMock.mockImplementation(async (req: Request) =>
      req.url.endsWith("/auth/refresh") ? json(401, { error: { code: "unauthorized" } }) : json(401, {}),
    );
    const res = await authFetch(new Request("http://x/api/v1/me"));
    expect(res.status).toBe(401);
    expect(tokenStore.get()).toBeNull();
    expect(document.cookie).not.toContain("fin_session=1");
  });

  it("does not refresh-loop on auth endpoints", async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    await authFetch(new Request("http://x/api/v1/auth/login", { method: "POST", body: "{}" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a late 401 after the refresh finished retries with the new token, no second refresh", async () => {
    tokenStore.set("old");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fetchMock.mockImplementation(async (req: Request) => {
      if (req.url.endsWith("/auth/refresh")) return json(200, { access_token: "new", user: { id: 1 } });
      if (req.headers.get("Authorization") === "Bearer new") return json(200, { ok: true });
      if (req.url.endsWith("/late")) await gate;
      return json(401, {});
    });
    const late = authFetch(new Request("http://x/api/v1/late"));
    const a = await authFetch(new Request("http://x/api/v1/expenses"));
    expect(a.status).toBe(200);
    await new Promise((r) => setTimeout(r, 5));
    release();
    expect((await late).status).toBe(200);
    const refreshCalls = fetchMock.mock.calls.filter(([r]) => (r as Request).url.endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });

  it("returns the retry's 401 as-is after exactly one refresh", async () => {
    tokenStore.set("old");
    fetchMock.mockImplementation(async (req: Request) =>
      req.url.endsWith("/auth/refresh") ? json(200, { access_token: "new", user: { id: 1 } }) : json(401, {}),
    );
    const res = await authFetch(new Request("http://x/api/v1/expenses"));
    expect(res.status).toBe(401);
    const refreshCalls = fetchMock.mock.calls.filter(([r]) => (r as Request).url.endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });

  it("a 5xx on refresh keeps the token and the hint", async () => {
    tokenStore.set("old");
    document.cookie = "fin_session=1; Path=/";
    fetchMock.mockImplementation(async (req: Request) =>
      req.url.endsWith("/auth/refresh") ? json(503, {}) : json(401, {}),
    );
    const res = await authFetch(new Request("http://x/api/v1/me"));
    expect(res.status).toBe(401);
    expect(tokenStore.get()).toBe("old");
    expect(document.cookie).toContain("fin_session=1");
  });

  it("a network error on refresh keeps the token", async () => {
    tokenStore.set("old");
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    expect(await refreshSession()).toBeNull();
    expect(tokenStore.get()).toBe("old");
  });

  it("refresh_race then 200 yields the session", async () => {
    let n = 0;
    fetchMock.mockImplementation(async () =>
      n++ === 0 ? json(401, { error: { code: "refresh_race" } }) : json(200, { access_token: "n2", user: { id: 3 } }),
    );
    const s = await refreshSession();
    expect(s?.user?.id).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenStore.get()).toBe("n2");
  });

  it("refreshSession returns the session", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { access_token: "abc", user: { id: 7 } }));
    const s = await refreshSession();
    expect(s?.user?.id).toBe(7);
  });
});
