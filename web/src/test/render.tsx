import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import es from "../../messages/es.json";
import en from "../../messages/en.json";

export function renderWithProviders(ui: ReactElement, { locale = "es" }: { locale?: "es" | "en" } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en} timeZone="America/Tijuana">
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
