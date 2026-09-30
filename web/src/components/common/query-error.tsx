"use client";
import { useErrorMessage } from "@/lib/api/error-messages";
import { cn } from "@/lib/utils";

/** A small localized error line for a query that failed to load. */
export function QueryError({ error, className }: { error: unknown; className?: string }) {
  const errMsg = useErrorMessage();
  return <p role="alert" className={cn("text-sm text-destructive", className)}>{errMsg(error)}</p>;
}
