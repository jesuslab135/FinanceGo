"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, refreshSession, tokenStore, unwrap } from "@/lib/api/client";
import type { RegisterInput, Session, User } from "@/lib/api/types";
import { hasSessionHint, setSessionHint } from "./session-hint";

type Status = "loading" | "authenticated" | "anonymous";

type AuthState = {
  status: Status;
  user: User | null;
  login(email: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  setUser(u: User): void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    let alive = true;
    const restored = hasSessionHint() ? refreshSession() : Promise.resolve(null);
    restored.then((s) => {
      if (!alive) return;
      setUser(s?.user ?? null);
      setStatus(s ? "authenticated" : "anonymous");
    });
    return () => {
      alive = false;
    };
  }, []);

  // Another tab or a failed refresh can clear the token: fall back to anonymous.
  useEffect(() => {
    const unsubscribe = tokenStore.subscribe(() => {
      if (!tokenStore.get()) setStatus((s) => (s === "authenticated" ? "anonymous" : s));
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Cached data belongs to whoever was signed in; drop it whenever the session ends.
  useEffect(() => {
    if (status === "anonymous") qc.clear();
  }, [status, qc]);

  const start = useCallback(
    (s: Session) => {
      // A new session (possibly another user) must never see the previous user's cached data.
      qc.clear();
      tokenStore.set(s.access_token ?? null);
      setSessionHint(true);
      setUser(s.user ?? null);
      setStatus("authenticated");
    },
    [qc],
  );

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      setUser,
      login: async (email, password) => start(await unwrap(api.POST("/auth/login", { body: { email, password } }))),
      register: async (input) => start(await unwrap(api.POST("/auth/register", { body: input }))),
      logout: async () => {
        await api.POST("/auth/logout").catch(() => undefined);
        tokenStore.set(null);
        setSessionHint(false);
        qc.clear();
        setUser(null);
        setStatus("anonymous");
      },
    }),
    [status, user, start, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
