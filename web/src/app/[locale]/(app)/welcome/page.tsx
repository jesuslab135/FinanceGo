"use client";
import { useEffect, useState } from "react";
import { WelcomeFlow } from "@/components/onboarding/welcome-flow";
import { useRouter } from "@/i18n/navigation";
import { useIncomeSources } from "@/lib/query/hooks";

export default function WelcomePage() {
  const router = useRouter();
  const incomes = useIncomeSources();
  // The count when the page opened. Creating an income mid-flow must not bounce the user out, but someone who
  // already has income (a returning user who typed /welcome) goes straight to the dashboard.
  const [entryCount, setEntryCount] = useState<number | undefined>();
  if (entryCount === undefined && incomes.data) setEntryCount(incomes.data.length);
  const returning = (entryCount ?? 0) > 0;

  useEffect(() => {
    if (returning) router.replace("/dashboard");
  }, [returning, router]);

  // A failed query shows the flow rather than a dead end: skipping is always available there.
  if (returning || (incomes.isPending && entryCount === undefined)) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground" aria-busy>…</div>;
  }
  return <WelcomeFlow />;
}
