"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type * as T from "@/lib/api/types";
import { ME_KEY } from "./keys";

/** After any write, every finance view may be stale (balances depend on everything). */
export function invalidateFinance(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
}

function useFinanceMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateFinance(qc) });
}

const items = <X,>(r: { items?: X[] }) => r.items ?? [];
const path = (id: number) => ({ params: { path: { id } } });

// ---- profile
export const useMe = () => useQuery({ queryKey: ME_KEY, queryFn: () => unwrap(api.GET("/me")) });

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: T.ProfileInput) => unwrap(api.PUT("/me", { body: v })),
    onSuccess: (u) => {
      qc.setQueryData(ME_KEY, u);
      return invalidateFinance(qc);
    },
  });
}

// ---- categories & budgets
export const useCategories = (kind?: "expense" | "income") =>
  useQuery({
    queryKey: ["categories"],
    queryFn: () => unwrap(api.GET("/categories")).then(items<T.Category>),
    select: (l) => (kind ? l.filter((c) => c.kind === kind) : l),
  });
export const useCreateCategory = () => useFinanceMutation((v: T.CategoryInput) => unwrap(api.POST("/categories", { body: v })));
export const useUpdateCategory = () =>
  useFinanceMutation(({ id, ...v }: T.CategoryInput & { id: number }) => unwrap(api.PUT("/categories/{id}", { ...path(id), body: v })));
export const useDeleteCategory = () =>
  useFinanceMutation(({ id, reassignTo }: { id: number; reassignTo?: number }) =>
    unwrap(api.DELETE("/categories/{id}", { params: { path: { id }, query: { reassign_to: reassignTo } } })),
  );
export const useBudgets = () =>
  useQuery({ queryKey: ["budgets"], queryFn: () => unwrap(api.GET("/category-budgets")).then(items<T.CategoryBudget>) });
export const usePutBudget = () =>
  useFinanceMutation(({ categoryId, limit }: { categoryId: number; limit: number }) =>
    unwrap(api.PUT("/category-budgets/{id}", { ...path(categoryId), body: { monthly_limit: limit } })),
  );
export const useDeleteBudget = () => useFinanceMutation((categoryId: number) => unwrap(api.DELETE("/category-budgets/{id}", path(categoryId))));

// ---- payment methods, card payments, plans, statements
export const usePaymentMethods = () =>
  useQuery({ queryKey: ["payment-methods"], queryFn: () => unwrap(api.GET("/payment-methods")).then(items<T.PaymentMethod>) });
export const useCreatePaymentMethod = () =>
  useFinanceMutation((v: T.PaymentMethodInput) => unwrap(api.POST("/payment-methods", { body: v })));
export const useUpdatePaymentMethod = () =>
  useFinanceMutation(({ id, ...v }: T.PaymentMethodInput & { id: number }) => unwrap(api.PUT("/payment-methods/{id}", { ...path(id), body: v })));
export const useDeletePaymentMethod = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/payment-methods/{id}", path(id))));

export const useStatement = (pmId: number, cycle?: string) =>
  useQuery({
    queryKey: ["statement", pmId, cycle ?? null],
    queryFn: () => unwrap(api.GET("/payment-methods/{id}/statement", { params: { path: { id: pmId }, query: { cycle } } })),
  });
export const useCardPayments = (pmId: number) =>
  useQuery({
    queryKey: ["card-payments", pmId],
    queryFn: () => unwrap(api.GET("/card-payments", { params: { query: { payment_method_id: pmId } } })).then(items<T.CardPayment>),
  });
export const useCreateCardPayment = () => useFinanceMutation((v: T.CardPaymentInput) => unwrap(api.POST("/card-payments", { body: v })));
export const useDeleteCardPayment = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/card-payments/{id}", path(id))));

export const usePlans = (pmId?: number) =>
  useQuery({
    queryKey: ["plans", pmId ?? null],
    queryFn: () => unwrap(api.GET("/installment-plans", { params: { query: { payment_method_id: pmId } } })).then(items<T.InstallmentPlan>),
  });
export const useCreatePlan = () => useFinanceMutation((v: T.InstallmentPlanInput) => unwrap(api.POST("/installment-plans", { body: v })));
export const useUpdatePlan = () =>
  useFinanceMutation(({ id, ...v }: T.InstallmentPlanInput & { id: number }) => unwrap(api.PUT("/installment-plans/{id}", { ...path(id), body: v })));
export const useCancelPlan = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/installment-plans/{id}", path(id))));

// ---- recurring templates & month entries
export const useIncomeSources = () =>
  useQuery({ queryKey: ["income-sources"], queryFn: () => unwrap(api.GET("/income-sources")).then(items<T.IncomeSource>) });
export const useCreateIncomeSource = () => useFinanceMutation((v: T.IncomeSourceInput) => unwrap(api.POST("/income-sources", { body: v })));
export const useUpdateIncomeSource = () =>
  useFinanceMutation(({ id, ...v }: T.IncomeSourceInput & { id: number }) => unwrap(api.PUT("/income-sources/{id}", { ...path(id), body: v })));
export const useDeactivateIncomeSource = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/income-sources/{id}", path(id))));

export const useFixedPayments = () =>
  useQuery({ queryKey: ["fixed-payments"], queryFn: () => unwrap(api.GET("/fixed-payments")).then(items<T.FixedPayment>) });
export const useCreateFixedPayment = () => useFinanceMutation((v: T.FixedPaymentInput) => unwrap(api.POST("/fixed-payments", { body: v })));
export const useUpdateFixedPayment = () =>
  useFinanceMutation(({ id, ...v }: T.FixedPaymentInput & { id: number }) => unwrap(api.PUT("/fixed-payments/{id}", { ...path(id), body: v })));
export const useDeactivateFixedPayment = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/fixed-payments/{id}", path(id))));

export const useMonthEntries = (month: string) =>
  useQuery({
    queryKey: ["entries", month],
    queryFn: () => unwrap(api.GET("/months/{month}/entries", { params: { path: { month } } })).then(items<T.Entry>),
  });
export const useUpdateEntry = () =>
  useFinanceMutation(({ id, ...v }: T.EntryUpdate & { id: number }) => unwrap(api.PUT("/entries/{id}", { ...path(id), body: v })));

// ---- expenses
export type ExpenseFilters = { from?: string; to?: string; category_id?: number; payment_method_id?: number; q?: string };

export const useExpenses = (f: ExpenseFilters) =>
  useInfiniteQuery({
    queryKey: ["expenses", f],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => unwrap(api.GET("/expenses", { params: { query: { ...f, cursor: pageParam, limit: 50 } } })),
    getNextPageParam: (last: T.ExpensePage) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
export const useCreateExpense = () => useFinanceMutation((v: T.ExpenseInput) => unwrap(api.POST("/expenses", { body: v })));
export const useUpdateExpense = () =>
  useFinanceMutation(({ id, ...v }: T.ExpenseInput & { id: number }) => unwrap(api.PUT("/expenses/{id}", { ...path(id), body: v })));
export const useDeleteExpense = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/expenses/{id}", path(id))));

// ---- dashboard
export const useSummary = (month?: string) =>
  useQuery({ queryKey: ["summary", month ?? null], queryFn: () => unwrap(api.GET("/dashboard/summary", { params: { query: { month } } })) });
export const useSeries = (period: "day" | "week" | "month", from: string, to: string) =>
  useQuery({
    queryKey: ["series", period, from, to],
    queryFn: () => unwrap(api.GET("/dashboard/series", { params: { query: { period, from, to } } })).then(items<T.SeriesPoint>),
  });
export const useBreakdown = (by: "category" | "payment_method", from: string, to: string) =>
  useQuery({
    queryKey: ["breakdown", by, from, to],
    queryFn: () => unwrap(api.GET("/dashboard/breakdown", { params: { query: { by, from, to } } })).then(items<T.BreakdownItem>),
  });
export const useCardsOverview = () =>
  useQuery({ queryKey: ["cards-overview"], queryFn: () => unwrap(api.GET("/dashboard/cards")).then(items<T.CardSummary>) });
export const useUpcoming = (days: number) =>
  useQuery({ queryKey: ["upcoming", days], queryFn: () => unwrap(api.GET("/dashboard/upcoming", { params: { query: { days } } })).then(items<T.UpcomingItem>) });
