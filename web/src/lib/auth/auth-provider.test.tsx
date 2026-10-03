import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/api/types";
import { tokenStore } from "@/lib/api/token-store";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));

vi.mock("@/lib/api/client", async () => {
  const tokens = await import("@/lib/api/token-store");
  return {
    api: { POST: mocks.post },
    refreshSession: mocks.refresh,
    tokenStore: tokens.tokenStore,
    unwrap: async (p: Promise<{ data?: unknown }>) => (await p).data,
  };
});

import { AuthProvider, useAuth } from "./auth-provider";

const session = (id: number, name: string): Session =>
  ({ access_token: `token-${id}`, user: { id, name, email: `${name}@example.com` } }) as unknown as Session;

function Probe() {
  const auth = useAuth();
  return (
    <>
      <p>{`${auth.status}:${auth.user?.name ?? "-"}`}</p>
      <button onClick={() => auth.login("bob@example.com", "password123")}>login</button>
    </>
  );
}

function setup() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return qc;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.refresh.mockReset();
    tokenStore.set(null);
    document.cookie = "fin_session=1; Path=/";
  });

  it("clears the previous user's cached data when another user logs in", async () => {
    mocks.refresh.mockResolvedValue(session(1, "ana"));
    const qc = setup();
    await screen.findByText("authenticated:ana");
    qc.setQueryData(["expenses", {}], { data: ["ana's lunch"] });

    mocks.post.mockResolvedValue({ data: session(2, "bob") });
    fireEvent.click(screen.getByRole("button", { name: "login" }));

    await screen.findByText("authenticated:bob");
    expect(qc.getQueryData(["expenses", {}])).toBeUndefined();
  });

  it("clears the cache when the session ends without an explicit logout", async () => {
    mocks.refresh.mockResolvedValue(session(1, "ana"));
    const qc = setup();
    await screen.findByText("authenticated:ana");
    qc.setQueryData(["summary", "2026-09"], { available: 1 });

    act(() => tokenStore.set(null)); // e.g. a failed refresh in another request
    await screen.findByText("anonymous:ana");
    await waitFor(() => expect(qc.getQueryData(["summary", "2026-09"])).toBeUndefined());
  });
});
