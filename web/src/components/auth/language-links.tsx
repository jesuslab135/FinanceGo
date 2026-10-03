"use client";
import { Link, usePathname } from "@/i18n/navigation";

/** Switches language while staying on the current auth page (login ↔ register). */
export function LanguageLinks({ label }: { label: string }) {
  const pathname = usePathname();
  const href = pathname === "/register" ? "/register" : "/login";
  return (
    <nav className="flex justify-center gap-3 text-sm" aria-label={label}>
      <Link href={href} locale="es" className="underline-offset-4 hover:underline">Español</Link>
      <Link href={href} locale="en" className="underline-offset-4 hover:underline">English</Link>
    </nav>
  );
}
