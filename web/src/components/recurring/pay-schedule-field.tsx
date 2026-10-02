"use client";
import { addDays, addMonths, format, startOfMonth } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FieldError } from "@/components/common/field-error";
import { useToday } from "@/hooks/use-today";
import { parseISODate, toISODate } from "@/lib/dates";
import { FREQUENCIES, payDates, upcomingPayDates, type Frequency, type PaySchedule } from "@/lib/recurring";
import { cn } from "@/lib/utils";

/** What the form holds; every frequency keeps its own fields so switching back and forth loses nothing. */
export type ScheduleDraft = {
  frequency: Frequency;
  day: number;
  /** NaN while only one of the two semimonthly days is picked. */
  secondDay: number;
  /** 0 (Sunday) to 6, for weekly. */
  weekday: number;
  /** "YYYY-MM-DD" of a real pay date, for biweekly. */
  payDate: string;
};
export type ScheduleErrors = Partial<Record<"day" | "secondDay" | "payDate", string>>;

export const DEFAULT_SCHEDULE: ScheduleDraft = { frequency: "monthly", day: 15, secondDay: 30, weekday: 5, payDate: "" };

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
// Monday first; 2026-01-04 is a Sunday, so day n of that week has weekday n.
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const weekdayDate = (weekday: number) => new Date(2026, 0, 4 + weekday);
const validDay = (d: number) => Number.isInteger(d) && d >= 1 && d <= 31;

export function scheduleFromSource(s?: Partial<PaySchedule>): ScheduleDraft {
  const anchor = s?.anchor_date ? parseISODate(s.anchor_date) : null;
  return {
    frequency: s?.frequency ?? "monthly",
    day: s?.day_of_month ?? DEFAULT_SCHEDULE.day,
    secondDay: s?.second_day ?? DEFAULT_SCHEDULE.secondDay,
    weekday: anchor ? anchor.getDay() : DEFAULT_SCHEDULE.weekday,
    payDate: s?.anchor_date ?? "",
  };
}

/** Field errors as message keys under `validation`; empty when the schedule can be saved. */
export function scheduleErrors(d: ScheduleDraft): ScheduleErrors {
  const e: ScheduleErrors = {};
  if (d.frequency === "monthly" && !validDay(d.day)) e.day = "day";
  if (d.frequency === "semimonthly" && (!validDay(d.day) || !validDay(d.secondDay) || d.day === d.secondDay)) e.secondDay = "twoDays";
  if (d.frequency === "biweekly" && !/^\d{4}-\d{2}-\d{2}$/.test(d.payDate)) e.payDate = "payDate";
  return e;
}

/** The API fields for a draft. Weekly is anchored on the next such weekday from `today`. */
export function scheduleInput(d: ScheduleDraft, today: Date): Required<PaySchedule> {
  const base = { frequency: d.frequency, day_of_month: validDay(d.day) ? d.day : 1, second_day: null, anchor_date: null };
  switch (d.frequency) {
    case "semimonthly":
      return { ...base, day_of_month: Math.min(d.day, d.secondDay), second_day: Math.max(d.day, d.secondDay) };
    case "weekly":
      return { ...base, anchor_date: toISODate(addDays(today, (d.weekday - today.getDay() + 7) % 7)) };
    case "biweekly":
      return { ...base, anchor_date: d.payDate };
    default:
      return base;
  }
}

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]";
const CHIP = cn("min-h-11 rounded-full border px-4 text-sm font-medium transition-colors", FOCUS);
const CELL = cn("flex aspect-square min-h-10 w-full items-center justify-center rounded-full text-sm tabular-nums transition-colors", FOCUS);
const cell = (on: boolean) => cn(CELL, on ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted");

/** A real month: tap any day you get paid. Every pay date the schedule produces is marked. */
function PayCalendar({ schedule, today, onPick }: { schedule: PaySchedule | null; today: Date; onPick: (d: Date) => void }) {
  const t = useTranslations("schedule");
  const locale = useLocale() === "en" ? enUS : es;
  const [view, setView] = useState(() => startOfMonth(today));
  const paid = new Set(schedule ? payDates(schedule, view.getFullYear(), view.getMonth()).map((d) => d.getDate()) : []);
  const lead = (view.getDay() + 6) % 7; // blank cells before day 1, Monday first
  const count = addDays(addMonths(view, 1), -1).getDate();
  const todayKey = toISODate(today);
  return (
    <div className="rounded-2xl border bg-surface-raised p-3">
      <div className="flex items-center justify-between pb-2">
        <button type="button" aria-label={t("prevMonth")} className={cn("flex size-11 items-center justify-center rounded-full hover:bg-muted", FOCUS)} onClick={() => setView(addMonths(view, -1))}><ChevronLeft className="size-4" aria-hidden /></button>
        <p className="text-sm font-medium capitalize" aria-live="polite">{format(view, "LLLL yyyy", { locale })}</p>
        <button type="button" aria-label={t("nextMonth")} className={cn("flex size-11 items-center justify-center rounded-full hover:bg-muted", FOCUS)} onClick={() => setView(addMonths(view, 1))}><ChevronRight className="size-4" aria-hidden /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => <span key={w} aria-hidden className="pb-1 text-xs capitalize text-muted-foreground">{format(weekdayDate(w), "EEEEEE", { locale })}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const date = new Date(view.getFullYear(), view.getMonth(), i + 1);
          const on = paid.has(i + 1);
          return (
            <button
              key={i} type="button" aria-pressed={on} aria-label={format(date, "EEEE d MMMM", { locale })}
              className={cn(cell(on), !on && toISODate(date) === todayKey && "ring-1 ring-brand/60")} onClick={() => onPick(date)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** How often an income pays and on which days: monthly, twice a month, every two weeks or weekly. */
export function PayScheduleField({ value, onChange, errors = {} }: {
  value: ScheduleDraft; onChange: (v: ScheduleDraft) => void; errors?: ScheduleErrors;
}) {
  const t = useTranslations();
  const dfLocale = useLocale() === "en" ? enUS : es;
  const today = useToday();
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...value, ...patch });
  const err = (key?: string) => (key ? t(`validation.${key}`) : undefined);
  const ready = Object.keys(scheduleErrors(value)).length === 0;
  const input = ready ? scheduleInput(value, today) : null;
  const upcoming = input ? upcomingPayDates(input, today, 3) : [];
  const { frequency } = value;

  const picked = frequency === "semimonthly" ? [value.day, value.secondDay].filter(validDay) : [value.day];
  const pickDay = (d: number) => {
    if (frequency === "monthly") return set({ day: d });
    // Two days: tapping a picked one drops it, a third replaces the one picked first.
    const next = picked.includes(d) ? picked.filter((x) => x !== d) : [...picked, d].slice(-2);
    set({ day: next[0] ?? NaN, secondDay: next[1] ?? NaN });
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("schedule.frequency")}</legend>
        <div className="flex flex-wrap gap-2">
          {FREQUENCIES.map((f) => (
            <button key={f} type="button" aria-pressed={frequency === f} className={cn(CHIP, frequency === f ? "border-primary bg-primary text-primary-foreground" : "bg-surface-raised")} onClick={() => set({ frequency: f })}>
              {t(`schedule.${f}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {(frequency === "monthly" || frequency === "semimonthly") && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t(frequency === "monthly" ? "welcome.payday" : "schedule.paydays")}</legend>
          <div className="grid grid-cols-7 gap-1 rounded-2xl border bg-surface-raised p-3">
            {MONTH_DAYS.map((d) => (
              <button key={d} type="button" aria-pressed={picked.includes(d)} className={cell(picked.includes(d))} onClick={() => pickDay(d)}>{d}</button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t(frequency === "monthly" ? "recurring.dayHint" : "schedule.twoDaysHint")}</p>
          <FieldError message={err(errors.day ?? errors.secondDay)} />
        </fieldset>
      )}

      {(frequency === "weekly" || frequency === "biweekly") && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("schedule.pickPayDate")}</legend>
          <PayCalendar schedule={input} today={today} onPick={(d) => set({ weekday: d.getDay(), payDate: toISODate(d) })} />
          <p className="text-xs text-muted-foreground">{t(frequency === "weekly" ? "schedule.weeklyHint" : "schedule.biweeklyHint")}</p>
          <FieldError message={err(errors.payDate)} />
        </fieldset>
      )}

      {upcoming.length > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("schedule.upcoming", { dates: upcoming.map((d) => format(d, "EEE d MMM", { locale: dfLocale })).join(" · ") })}
        </p>
      )}
    </div>
  );
}
