"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { MotionProvider } from "@/components/motion/motion-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/errors";
import { AuthProvider } from "@/lib/auth/auth-provider";

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster richColors position="top-center" theme={(theme as "light" | "dark" | "system" | undefined) ?? "system"} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MotionProvider>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AuthProvider>
        <ThemedToaster />
      </QueryClientProvider>
      </MotionProvider>
    </ThemeProvider>
  );
}
