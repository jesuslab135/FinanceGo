"use client";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useToday } from "@/hooks/use-today";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { celebrate } from "@/lib/celebrate";
import { duration, ease } from "@/lib/motion";
import { markOnboardingSettled, ONBOARDING_SKIPPED } from "@/lib/onboarding";
import { userKey, writeJSON } from "@/lib/storage";
import { Progress } from "./progress";
import { EMPTY_CARD_DRAFT, StepCards, type AddedCard, type CardDraft } from "./step-cards";
import { StepFixed, type FixedDraft } from "./step-fixed";
import { StepIncome, type IncomeDraft } from "./step-income";

export function WelcomeFlow() {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const today = useToday();
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  // Drafts live here (not in the steps) so going back keeps what was typed and what was already saved.
  const [income, setIncome] = useState<IncomeDraft>({ name: t("welcome.salary"), cents: 0, day: 15 });
  const [fixed, setFixed] = useState<FixedDraft>({ rows: [], removedIds: [], customCount: 0 });
  const [cards, setCards] = useState<AddedCard[]>([]);
  const [cardDraft, setCardDraft] = useState<CardDraft>(EMPTY_CARD_DRAFT);
  // Focus the heading of the step that is entering (not the exiting one, which AnimatePresence keeps mounted),
  // and never on first load.
  const focusHeading = useRef(false);

  const go = (to: number) => { focusHeading.current = true; setDir(to > step ? 1 : -1); setStep(to); };

  const skip = () => {
    if (user) {
      markOnboardingSettled(user.id);
      writeJSON(userKey(user.id, ONBOARDING_SKIPPED), true);
    }
    router.replace("/dashboard");
  };
  const finish = () => {
    router.replace("/dashboard");
    void celebrate("welcome", t("celebrate.welcome"));
  };


  const offset = reduce ? 0 : 24 * dir;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-8 pt-4">
      <header className="flex items-center justify-between">
        <Logo withWordmark size={28} />
        <Button type="button" variant="ghost" className="min-h-11 min-w-11 px-4" onClick={skip}>{t("welcome.skip")}</Button>
      </header>
      <div className="py-4"><Progress step={step} /></div>
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <m.section
          key={step}
          className="space-y-6"
          initial={{ opacity: 0, x: offset }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -offset }}
          transition={reduce ? { duration: 0 } : { duration: duration.page, ease: ease.enter }}
        >
          <div className="space-y-2">
            <h1 ref={(el) => { if (el && focusHeading.current) { focusHeading.current = false; el.focus(); } }} tabIndex={-1} className="font-display text-2xl font-extrabold outline-none">{t(`welcome.title${step}`)}</h1>
            <p className="text-sm text-muted-foreground">{t(`welcome.subtitle${step}`)}</p>
          </div>
          {step === 1 && <StepIncome draft={income} onChange={setIncome} today={today} onDone={() => go(2)} />}
          {step === 2 && <StepFixed draft={fixed} onChange={setFixed} today={today} onBack={() => go(1)} onDone={() => go(3)} />}
          {step === 3 && <StepCards cards={cards} draft={cardDraft} onDraft={setCardDraft} onAdded={(c) => setCards((l) => [...l, c])} onBack={() => go(2)} onFinish={finish} />}
        </m.section>
      </AnimatePresence>
    </main>
  );
}
