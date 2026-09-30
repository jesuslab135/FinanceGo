import type { ComponentType, ReactNode } from "react";
import { FadeInItem, FadeInList } from "@/components/motion/fade-in-list";
import { AllCaughtUp } from "@/components/illustrations/all-caught-up";
import { EmptyExpenses } from "@/components/illustrations/empty-expenses";
import { EmptyMonth } from "@/components/illustrations/empty-month";
import { NoCards } from "@/components/illustrations/no-cards";
import { NoRecurring } from "@/components/illustrations/no-recurring";

const illustrations = {
  expenses: EmptyExpenses,
  month: EmptyMonth,
  cards: NoCards,
  recurring: NoRecurring,
  caughtUp: AllCaughtUp,
} satisfies Record<string, ComponentType<{ className?: string }>>;

export type EmptyIllustration = keyof typeof illustrations;

/** The illustration is decorative (aria-hidden); the text, title and action carry the meaning. */
export function EmptyState({ children, action, illustration, title }: {
  children: ReactNode;
  action?: ReactNode;
  illustration?: EmptyIllustration;
  title?: string;
}) {
  const Art = illustration ? illustrations[illustration] : null;
  return (
    <FadeInList as="div">
      <FadeInItem as="div" layout={false} className="flex flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center text-sm shadow-card">
        {Art && <Art className="h-auto w-40 max-w-full text-muted-foreground" />}
        {title && <p className="font-display text-base font-bold">{title}</p>}
        <p className="text-muted-foreground">{children}</p>
        {action && <div className="flex w-full max-w-xs flex-col items-stretch [&_a]:min-h-11 [&_button]:min-h-11">{action}</div>}
      </FadeInItem>
    </FadeInList>
  );
}
