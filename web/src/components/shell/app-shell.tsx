"use client";
import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // First-run setup is a focused, full-screen flow: no navigation to wander off into.
  if (pathname.startsWith("/welcome")) return <>{children}</>;
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
