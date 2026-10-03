"use client";
import { useEffect, useState } from "react";
import { toISODate } from "@/lib/dates";

/** The real current date, refreshed at local midnight and when the tab regains focus. Stable between day changes. */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const sync = () => setToday((prev) => (toISODate(prev) === toISODate(new Date()) ? prev : new Date()));
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => { sync(); schedule(); }, next.getTime() - now.getTime());
    };
    schedule();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return today;
}
