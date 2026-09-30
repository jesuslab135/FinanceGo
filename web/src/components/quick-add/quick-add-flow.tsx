"use client";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CategoryGrid } from "@/components/quick-add/category-grid";
import { CardChips } from "@/components/quick-add/card-chips";
import { Keypad } from "@/components/quick-add/keypad";
import { useFormatMoney } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import { useErrorMessage } from "@/lib/api/error-messages";
import { useAuth } from "@/lib/auth/auth-provider";
import { celebrate } from "@/lib/celebrate";
import type { ExpenseInput } from "@/lib/api/types";
import { toISODate } from "@/lib/dates";
import { duration, ease } from "@/lib/motion";
import { useCategories, useCreateExpense, useDeleteExpense, usePaymentMethods } from "@/lib/query/hooks";
import { defaultCard, useRecents } from "@/lib/recents";
import { readJSON, userKey, writeJSON } from "@/lib/storage";

type Step = 1 | 2 | 3;

/** A suggestion is only looked up for descriptions of at least this many characters. */
const SUGGEST_MIN = 3;
const SUGGEST_DEBOUNCE_MS = 300;

export function QuickAddFlow({ prefill, onDone }: { prefill?: Partial<ExpenseInput>; onDone: () => void }) {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const reduce = useReducedMotion();
  const fmt = useFormatMoney();
  const { data: categories = [] } = useCategories("expense");
  const { data: methods = [] } = usePaymentMethods();
  const create = useCreateExpense();
  const remove = useDeleteExpense();
  const [recents, record] = useRecents();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>(prefill ? 3 : 1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [cents, setCents] = useState(prefill?.amount ?? 0);
  const [categoryId, setCategoryId] = useState<number | null>(prefill?.category_id ?? null);
  const [cardId, setCardId] = useState<number | null>(prefill?.payment_method_id ?? null);
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [date, setDate] = useState(prefill?.spent_on ?? toISODate(new Date()));
  const [suggested, setSuggested] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const focusHeading = useRef(false);
  const go = (to: Step) => { focusHeading.current = true; setDir(to > step ? 1 : -1); setStep(to); };

  // Suggest the category of the most recent expense whose description matches.
  useEffect(() => {
    const q = description.trim();
    if (q.length < SUGGEST_MIN) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.GET("/expenses", { params: { query: { q, limit: 5 } } });
        if (!cancelled) setSuggested(res.data?.items?.[0]?.category_id ?? null);
      } catch {
        if (!cancelled) setSuggested(null);
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [description]);

  const suggestion = description.trim().length >= SUGGEST_MIN && suggested !== null && suggested !== categoryId
    ? categories.find((c) => c.id === suggested)
    : undefined;

  /** True only when the user has never logged an expense and was never celebrated; a Repetir (prefill) save is never the first. */
  const isFirstExpense = async (): Promise<boolean> => {
    if (prefill || !user) return false;
    const key = userKey(user.id, "celebrated-first");
    if (readJSON(key, false)) return false;
    try {
      const res = await api.GET("/expenses", { params: { query: { limit: 1 } } });
      if (!res.data) return false;
      if ((res.data.items ?? []).length > 0) {
        writeJSON(key, true); // an established user: never check again
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const save = async () => {
    if (categoryId === null || cents <= 0 || saving) return;
    setSaving(true);
    try {
      const first = await isFirstExpense();
      const created = await create.mutateAsync({
        amount: cents,
        category_id: categoryId,
        // Generated type is `number | undefined`; the Go pointer field accepts JSON null (no method).
        payment_method_id: cardId as number | undefined,
        description: description.trim(),
        spent_on: date,
      });
      record(categoryId, cardId);
      navigator.vibrate?.(10);
      toast(t("common.saved"), { action: { label: t("common.undo"), onClick: () => remove.mutate(created.id) } });
      onDone();
      if (first && user) {
        writeJSON(userKey(user.id, "celebrated-first"), true);
        void celebrate("firstExpense", t("celebrate.firstExpense"), { reduceMotion: reduce ?? undefined });
      }
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  };

  const heading = (label: string, back?: Step) => (
    <div className="flex min-h-11 items-center gap-2">
      {back && (
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={t("quickAdd.back")} onClick={() => go(back)}>
          <ArrowLeft />
        </Button>
      )}
      <h3
        data-qa-heading
        tabIndex={-1}
        ref={(el) => { if (el && focusHeading.current) { focusHeading.current = false; el.focus(); } }}
        className="font-display text-lg font-bold outline-none"
      >
        {label}
      </h3>
      {step > 1 && <span className="num ml-auto font-display text-lg">{fmt(cents)}</span>}
    </div>
  );
  // Sticky inside the drawer's scrolling body so the primary action stays reachable on short screens.
  const footer = (children: ReactNode) => <div className="sticky bottom-0 -mx-4 bg-card px-4 pt-3">{children}</div>;

  let body: ReactNode;
  if (step === 1) {
    body = (
      <div className="space-y-4">
        {heading(t("quickAdd.amount"))}
        <Keypad cents={cents} onChange={setCents} onSubmit={() => cents > 0 && go(2)} />
        {footer(<Button type="button" className="h-12 w-full" disabled={cents === 0} onClick={() => go(2)}>{t("quickAdd.continue")}</Button>)}
      </div>
    );
  } else if (step === 2) {
    body = (
      <div className="space-y-4">
        {heading(t("quickAdd.category"), 1)}
        <CategoryGrid
          categories={categories}
          recent={recents.categories}
          value={categoryId}
          onSelect={(id) => {
            const card = defaultCard(recents, id);
            setCategoryId(id);
            setCardId(card !== null && methods.some((p) => p.id === card && p.active) ? card : null);
            go(3);
          }}
        />
      </div>
    );
  } else {
    body = (
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {heading(t("quickAdd.details"), 2)}
        <div className="space-y-2">
          <Label>{t("expenses.paymentMethod")}</Label>
          <CardChips methods={methods} value={cardId} onChange={setCardId} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qa-description">{t("expenses.description")}</Label>
          <Input id="qa-description" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
          {suggestion && (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-full border bg-surface-raised px-4 text-sm active:bg-muted"
              onClick={() => { setCategoryId(suggestion.id); setSuggested(null); }}
            >
              {t("quickAdd.suggestCategory", { name: suggestion.name })}
            </button>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="qa-date">{t("expenses.date")}</Label>
          <Input id="qa-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {footer(<Button type="submit" className="h-12 w-full" disabled={saving || categoryId === null || cents <= 0}>{t("common.save")}</Button>)}
      </form>
    );
  }

  // overflow-x-clip (not hidden) keeps the sticky footer pinned to the dialog scroll body; px-4 gives its -mx-4 bleed room.
  return (
    <div className="-mx-4 overflow-x-clip px-4">
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={step}
          initial={reduce ? false : { opacity: 0, x: 24 * dir }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: -24 * dir }}
          transition={reduce ? { duration: 0 } : { duration: duration.small, ease: ease.enter }}
        >
          {body}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
