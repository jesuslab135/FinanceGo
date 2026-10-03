import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { MotionProvider } from "@/components/motion/motion-provider";
import es from "../../messages/es.json";
import en from "../../messages/en.json";

export function renderWithProviders(ui: ReactElement, { locale = "es" }: { locale?: "es" | "en" } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // `wrapper` (not an inline tree) so RTL's rerender keeps the providers.
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en} timeZone="America/Tijuana">
      <MotionProvider>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </MotionProvider>
    </NextIntlClientProvider>
  );
  return render(ui, { wrapper: Wrapper });
}
