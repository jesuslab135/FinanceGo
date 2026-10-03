"use client";

import { AlertOctagon, AlertTriangle, Info, PartyPopper, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createElement, useState } from "react";
import { FadeInItem, FadeInList } from "@/components/motion/fade-in-list";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { useToday } from "@/hooks/use-today";
import { toISODate } from "@/lib/dates";
import type { Insight } from "@/lib/insights";
import { readJSON, userKey, writeJSON } from "@/lib/storage";

const TONE = {
  info: { Icon: Info, bg: "bg-card", icon: "text-muted-foreground" },
  good: { Icon: PartyPopper, bg: "bg-good/12", icon: "text-good" },
  warn: { Icon: AlertTriangle, bg: "bg-warning/16", icon: "text-foreground" },
  critical: { Icon: AlertOctagon, bg: "bg-critical/12", icon: "text-critical" },
} as const;

type Dismissed = Record<string, string>;

export function InsightsRow({ insights }: { insights: Insight[] }) {
  const t = useTranslations("insights");
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const today = toISODate(useToday());
  const storageKey = userKey(userId, "insights-dismissed");
  // Re-read when the user changes (userId is 0 until auth loads).
  const [store, setStore] = useState(() => ({ key: storageKey, map: readJSON<Dismissed>(storageKey, {}) }));
  if (store.key !== storageKey) setStore({ key: storageKey, map: readJSON<Dismissed>(storageKey, {}) });
  const dismissed = store.key === storageKey ? store.map : {};

  const dismiss = (id: string) => {
    // Keep only today's entries so the stored map cannot grow without bound.
    const next: Dismissed = { ...Object.fromEntries(Object.entries(dismissed).filter(([, d]) => d === today)), [id]: today };
    setStore({ key: storageKey, map: next });
    writeJSON(storageKey, next);
  };

  const visible = insights.filter((i) => dismissed[i.id] !== today);
  // With everything dismissed, render nothing: an empty labelled region would still leave a gap in the layout.
  if (visible.length === 0) return null;

  return (
    <section aria-label={t("title")}>
      <FadeInList as="div" className={`flex snap-x snap-mandatory gap-3 overflow-x-auto ${visible.length ? "pb-1" : ""} [scrollbar-width:none] md:grid md:grid-cols-3 md:overflow-visible`}>
        {visible.map((i) => {
          const tone = TONE[i.tone];
          return (
            <FadeInItem key={i.id} as="div" layout={false} className="min-w-[80%] snap-start md:min-w-0">
              <div className={`flex h-full items-start gap-3 rounded-2xl p-4 shadow-card ${tone.bg}`}>
                {createElement(tone.Icon, { className: `mt-0.5 size-5 shrink-0 ${tone.icon}`, "aria-hidden": true })}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`tone.${i.tone}`)}</p>
                  <p className="text-sm font-medium">{t(i.messageKey.replace(/^insights\./, ""), i.values)}</p>
                  {i.href && (
                    <Link href={i.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-foreground underline decoration-brand decoration-2 underline-offset-4">
                      {t("view")}
                    </Link>
                  )}
                </div>
                <button type="button" onClick={() => dismiss(i.id)} aria-label={t("dismiss")}
                  className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </FadeInItem>
          );
        })}
      </FadeInList>
    </section>
  );
}
