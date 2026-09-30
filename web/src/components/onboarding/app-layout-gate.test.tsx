import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { markOnboardingSettled } from "@/lib/onboarding";
import AppLayout from "../../app/[locale]/(app)/layout";

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: "/dashboard",
  incomes: { isPending: false, failureCount: 0, data: [] as unknown[] | undefined },
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: h.replace }), usePathname: () => h.pathname }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: 5, locale: "es" } }) }));
vi.mock("@/lib/query/hooks", () => ({ useIncomeSources: () => h.incomes }));
vi.mock("@/components/shell/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));

const page = () => renderWithProviders(<AppLayout><p>dashboard</p></AppLayout>);

describe("(app) layout onboarding gate", () => {
  beforeEach(() => {
    localStorage.clear();
    h.replace.mockReset();
    h.pathname = "/dashboard";
    h.incomes = { isPending: false, failureCount: 0, data: [] };
  });

  it("sends a brand-new user to /welcome without rendering the dashboard", () => {
    page();
    expect(h.replace).toHaveBeenCalledWith("/welcome");
    expect(screen.queryByText("dashboard")).not.toBeInTheDocument();
  });

  it("holds the page back while the income list loads (no dashboard flash), without redirecting yet", () => {
    h.incomes = { isPending: true, failureCount: 0, data: undefined };
    page();
    expect(screen.queryByText("dashboard")).not.toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalledWith("/welcome");
  });

  it("a failed income query never traps: the page renders and nothing redirects", () => {
    h.incomes = { isPending: false, failureCount: 0, data: undefined };
    page();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalledWith("/welcome");
  });

  it("a user with income sees the app", () => {
    h.incomes = { isPending: false, failureCount: 0, data: [{ id: 1 }] };
    page();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalledWith("/welcome");
  });

  it("a user who skipped is left alone", () => {
    localStorage.setItem("fin:onboarding-skipped:5", "true");
    h.incomes = { isPending: true, failureCount: 0, data: undefined };
    page();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("a skip survives storage that throws (session memory), so the user is not sent back to /welcome", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    markOnboardingSettled(5);
    page();
    get.mockRestore();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalledWith("/welcome");
  });

  it("stops holding the page once the income query has failed once, without redirecting", () => {
    h.incomes = { isPending: true, data: undefined, failureCount: 1 };
    page();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalledWith("/welcome");
  });

  it("does not redirect from /welcome itself (no loop)", () => {
    h.pathname = "/welcome";
    page();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalledWith("/welcome");
  });
});
