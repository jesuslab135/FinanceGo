package service

import (
	"context"
	"time"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/store"
)

type BudgetStatus struct {
	CategoryID int64  `json:"category_id"`
	Name       string `json:"name"`
	Color      string `json:"color"`
	Limit      int64  `json:"limit"`
	Spent      int64  `json:"spent"`
	Pct        int32  `json:"pct"`
}

type Summary struct {
	Month             datex.Month    `json:"month"`
	Currency          string         `json:"currency"`
	Income            int64          `json:"income"`
	FixedCommitted    int64          `json:"fixed_committed"`
	FixedPaid         int64          `json:"fixed_paid"`
	Installments      int64          `json:"installments"`
	Spent             int64          `json:"spent"`
	Available         int64          `json:"available"`
	SafeToSpendPerDay *int64         `json:"safe_to_spend_per_day"`
	DaysRemaining     *int32         `json:"days_remaining"`
	Budgets           []BudgetStatus `json:"budgets"`
}

// SafeToSpend spreads what is left of the month over the remaining days
// (today included). It is only meaningful for the month containing today.
func SafeToSpend(available int64, today, month time.Time) (perDay int64, daysLeft int, ok bool) {
	if !datex.MonthStart(today).Equal(datex.MonthStart(month)) {
		return 0, 0, false
	}
	daysLeft = datex.DaysIn(month) - today.Day() + 1
	return max(0, available) / int64(daysLeft), daysLeft, true
}

func (s *Service) Summary(ctx context.Context, a Actor, month *time.Time) (Summary, error) {
	today := s.today(a)
	m := datex.MonthStart(today)
	if month != nil {
		m = datex.MonthStart(*month)
	}
	if err := s.ensureMonth(ctx, s.q, a, m); err != nil {
		return Summary{}, err
	}
	u, err := s.q.GetUser(ctx, a.UserID)
	if err != nil {
		return Summary{}, err
	}
	t, err := s.q.MonthTotals(ctx, store.MonthTotalsParams{UserID: a.UserID, Month: m})
	if err != nil {
		return Summary{}, err
	}
	end := datex.AddMonths(m, 1).AddDate(0, 0, -1)
	spent, err := s.q.SpentBetween(ctx, store.SpentBetweenParams{UserID: a.UserID, FromDate: m, ToDate: end})
	if err != nil {
		return Summary{}, err
	}
	out := Summary{
		Month: datex.NewMonth(m), Currency: u.Currency, Income: t.Income, FixedCommitted: t.FixedCommitted,
		FixedPaid: t.FixedPaid, Installments: t.Installments, Spent: spent, Budgets: []BudgetStatus{},
	}
	out.Available = out.Income - out.FixedCommitted - out.Installments - out.Spent
	if per, days, ok := SafeToSpend(out.Available, today, m); ok {
		d := int32(days)
		out.SafeToSpendPerDay, out.DaysRemaining = &per, &d
	}
	rows, err := s.q.BudgetStatus(ctx, store.BudgetStatusParams{UserID: a.UserID, Month: m})
	if err != nil {
		return Summary{}, err
	}
	for _, r := range rows {
		out.Budgets = append(out.Budgets, BudgetStatus{CategoryID: r.CategoryID, Name: r.Name, Color: r.Color,
			Limit: r.MonthlyLimit, Spent: r.Spent, Pct: int32(r.Spent * 100 / r.MonthlyLimit)})
	}
	return out, nil
}

type CategoryBudget struct {
	CategoryID   int64 `json:"category_id"`
	MonthlyLimit int64 `json:"monthly_limit"`
}

func (s *Service) ListCategoryBudgets(ctx context.Context, a Actor) ([]CategoryBudget, error) {
	rows, err := s.q.ListCategoryBudgets(ctx, a.UserID)
	if err != nil {
		return nil, err
	}
	out := make([]CategoryBudget, len(rows))
	for i, r := range rows {
		out[i] = CategoryBudget{CategoryID: r.CategoryID, MonthlyLimit: r.MonthlyLimit}
	}
	return out, nil
}

func (s *Service) PutCategoryBudget(ctx context.Context, a Actor, categoryID, limit int64) (CategoryBudget, error) {
	var v apperr.V
	checkAmount(&v, "monthly_limit", limit)
	if err := v.Err(); err != nil {
		return CategoryBudget{}, err
	}
	if err := s.checkCategoryRef(ctx, s.q, a.UserID, categoryID, "expense", "category_id"); err != nil {
		return CategoryBudget{}, err
	}
	r, err := s.q.UpsertCategoryBudget(ctx, store.UpsertCategoryBudgetParams{UserID: a.UserID, CategoryID: categoryID, MonthlyLimit: limit})
	if err != nil {
		return CategoryBudget{}, err
	}
	return CategoryBudget{CategoryID: r.CategoryID, MonthlyLimit: r.MonthlyLimit}, nil
}

func (s *Service) DeleteCategoryBudget(ctx context.Context, a Actor, categoryID int64) error {
	n, err := s.q.DeleteCategoryBudget(ctx, store.DeleteCategoryBudgetParams{UserID: a.UserID, CategoryID: categoryID})
	if err != nil {
		return err
	}
	if n == 0 {
		return apperr.NotFound()
	}
	return nil
}
