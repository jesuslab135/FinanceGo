import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageLinks } from "./language-links";

const nav = vi.hoisted(() => ({ pathname: "/register" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => nav.pathname,
  Link: ({ href, locale, children }: { href: string; locale: string; children: React.ReactNode }) => <a href={`/${locale}${href}`}>{children}</a>,
}));

describe("LanguageLinks", () => {
  it("keeps the register page when switching language", () => {
    nav.pathname = "/register";
    render(<LanguageLinks label="Idioma" />);
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/register");
    expect(screen.getByRole("link", { name: "Español" })).toHaveAttribute("href", "/es/register");
  });

  it("keeps the login page when switching language", () => {
    nav.pathname = "/login";
    render(<LanguageLinks label="Idioma" />);
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/login");
  });
});
