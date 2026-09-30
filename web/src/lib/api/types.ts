import type { components } from "./schema";

type S = components["schemas"];

export type Session = S["service.Session"];
export type User = S["service.User"];
export type Category = S["service.Category"];
export type PaymentMethod = S["service.PaymentMethod"];
export type IncomeSource = S["service.IncomeSource"];
export type FixedPayment = S["service.FixedPayment"];
export type Entry = S["service.Entry"];
export type Expense = S["service.Expense"];
export type ExpensePage = S["service.ExpensePage"];
export type CardPayment = S["service.CardPayment"];
export type InstallmentPlan = S["service.InstallmentPlan"];
export type Statement = S["service.Statement"];
export type Summary = S["service.Summary"];
export type SeriesPoint = S["service.SeriesPoint"];
export type BreakdownItem = S["service.BreakdownItem"];
export type CardSummary = S["service.CardSummary"];
export type UpcomingItem = S["service.UpcomingItem"];
export type CategoryBudget = S["service.CategoryBudget"];

export type RegisterInput = S["service.RegisterInput"];
export type ProfileInput = S["service.ProfileInput"];
export type CategoryInput = S["service.CategoryInput"];
export type PaymentMethodInput = S["service.PaymentMethodInput"];
export type IncomeSourceInput = S["service.IncomeSourceInput"];
export type FixedPaymentInput = S["service.FixedPaymentInput"];
export type EntryUpdate = S["service.EntryUpdate"];
export type ExpenseInput = S["service.ExpenseInput"];
export type CardPaymentInput = S["service.CardPaymentInput"];
export type InstallmentPlanInput = S["service.InstallmentPlanInput"];
