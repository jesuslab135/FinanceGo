package service

import (
	"cmp"
	"context"
	"slices"
	"time"

	"financego/internal/apperr"
	"financego/internal/cards"
	"financego/internal/datex"
	"financego/internal/store"
)

type BudgetStatus struct {
	CategoryID int64  `json:"category_id" validate:"required"`
	Name       string `json:"name" validate:"required"`
	Color      string `json:"color" validate:"required"`
	Limit      int64  `json:"limit" validate:"required"`
	Spent      int64  `json:"spent" validate:"required"`
	Pct        int32  `json:"pct" validate:"required"`
}

type Summary struct {
	Month             datex.Month    `json:"month" validate:"required"`
	Currency          string         `json:"currency" validate:"required"`
	Income            int64          `json:"income" validate:"required"`
	FixedCommitted    int64          `json:"fixed_committed" validate:"required"`
	FixedPaid         int64          `json:"fixed_paid" validate:"required"`
	Installments      int64          `json:"installments" validate:"required"`
	Spent             int64          `json:"spent" validate:"required"`
	Available         int64          `json:"available" validate:"required"`
	SafeToSpendPerDay *int64         `json:"safe_to_spend_per_day"`
	DaysRemaining     *int32         `json:"days_remaining"`
	Budgets           []BudgetStatus `json:"budgets" validate:"required"`
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
			Limit: r.MonthlyLimit, Spent: r.Spent, Pct: budgetPct(r.Spent, r.MonthlyLimit)})
	}
	return out, nil
}

// budgetPct is spent as a percentage of limit, clamped to [0, 100000] so it
// always fits the int32 field.
func budgetPct(spent, limit int64) int32 {
	return int32(min(max(spent*100/limit, 0), 100000))
}

type CategoryBudget struct {
	CategoryID   int64 `json:"category_id" validate:"required"`
	MonthlyLimit int64 `json:"monthly_limit" validate:"required"`
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

type SeriesPoint struct {
	Start     datex.Date `json:"start" validate:"required"`
	Expenses  int64      `json:"expenses" validate:"required"`
	Committed int64      `json:"committed" validate:"required"`
}

type BreakdownItem struct {
	ID     *int64 `json:"id"`
	Name   string `json:"name" validate:"required"`
	Color  string `json:"color" validate:"required"`
	Amount int64  `json:"amount" validate:"required"`
}

type CardSummary struct {
	PaymentMethodID int64       `json:"payment_method_id" validate:"required"`
	Nickname        string      `json:"nickname" validate:"required"`
	Color           string      `json:"color" validate:"required"`
	Last4           *string     `json:"last4"`
	CurrentBalance  int64       `json:"current_balance" validate:"required"`
	CreditLimit     *int64      `json:"credit_limit"`
	AvailableCredit *int64      `json:"available_credit"`
	Utilization     *float64    `json:"utilization"`
	Cycle           datex.Month `json:"cycle" validate:"required"`
	AmountDue       int64       `json:"amount_due" validate:"required"`
	DueOn           datex.Date  `json:"due_on" validate:"required"`
}

type UpcomingItem struct {
	Type            string     `json:"type" validate:"required"`
	Date            datex.Date `json:"date" validate:"required"`
	Name            string     `json:"name" validate:"required"`
	Amount          int64      `json:"amount" validate:"required"`
	EntryID         *int64     `json:"entry_id"`
	PaymentMethodID *int64     `json:"payment_method_id"`
	Overdue         bool       `json:"overdue" validate:"required"`
}

func checkRange(from, to time.Time, maxDays int) error {
	var v apperr.V
	v.Check(!to.Before(from), "to", "must not be before from")
	v.Check(int(to.Sub(from).Hours()/24) < maxDays, "from", "range is too long")
	return v.Err()
}

// ensureRange materializes every month touched by [from, to], up to the
// 12-month generation horizon.
func (s *Service) ensureRange(ctx context.Context, a Actor, from, to time.Time) error {
	horizon := datex.AddMonths(datex.MonthStart(s.today(a)), maxMonthsAhead)
	for m := datex.MonthStart(from); !m.After(to) && !m.After(horizon); m = datex.AddMonths(m, 1) {
		if err := s.ensureMonth(ctx, s.q, a, m); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) Series(ctx context.Context, a Actor, period string, from, to time.Time) ([]SeriesPoint, error) {
	maxDays := 5*366 + 1
	switch period {
	case "day":
		maxDays = 367
	case "week", "month":
	default:
		return nil, apperr.Validation(map[string]string{"period": "must be day, week or month"})
	}
	if err := checkRange(from, to, maxDays); err != nil {
		return nil, err
	}
	if err := s.ensureRange(ctx, a, from, to); err != nil {
		return nil, err
	}
	rows, err := s.q.SpendingSeries(ctx, store.SpendingSeriesParams{UserID: a.UserID, Period: period, FromDate: from, ToDate: to})
	if err != nil {
		return nil, err
	}
	out := make([]SeriesPoint, len(rows))
	for i, r := range rows {
		out[i] = SeriesPoint{Start: datex.NewDate(r.Start), Expenses: r.Expenses, Committed: r.Committed}
	}
	return out, nil
}

func (s *Service) Breakdown(ctx context.Context, a Actor, by string, from, to time.Time) ([]BreakdownItem, error) {
	if by != "category" && by != "payment_method" {
		return nil, apperr.Validation(map[string]string{"by": "must be category or payment_method"})
	}
	if err := checkRange(from, to, 5*366+1); err != nil {
		return nil, err
	}
	if err := s.ensureRange(ctx, a, from, to); err != nil {
		return nil, err
	}
	out := []BreakdownItem{}
	if by == "category" {
		rows, err := s.q.BreakdownByCategory(ctx, store.BreakdownByCategoryParams{UserID: a.UserID, FromDate: from, ToDate: to})
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			id := r.ID
			out = append(out, BreakdownItem{ID: &id, Name: r.Name, Color: r.Color, Amount: r.Amount})
		}
		return out, nil
	}
	rows, err := s.q.BreakdownByPaymentMethod(ctx, store.BreakdownByPaymentMethodParams{UserID: a.UserID, FromDate: from, ToDate: to})
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		item := BreakdownItem{ID: r.ID, Amount: r.Amount, Color: "#94a3b8"}
		if r.Nickname != nil {
			item.Name = *r.Nickname
		}
		if r.Color != nil {
			item.Color = *r.Color
		}
		out = append(out, item)
	}
	return out, nil
}

// CardsOverview reports every active credit card plus inactive ones that still
// carry a balance.
func (s *Service) CardsOverview(ctx context.Context, a Actor) ([]CardSummary, error) {
	pms, err := s.q.ListCreditCards(ctx, a.UserID)
	if err != nil {
		return nil, err
	}
	today := s.today(a)
	out := []CardSummary{}
	for _, pm := range pms {
		st, err := s.loadCard(ctx, s.q, a.UserID, pm)
		if err != nil {
			return nil, err
		}
		r := st.compute(cards.RelevantCycle(today, st.card.StatementDay, st.card.DueDay))
		if !pm.Active && r.CurrentBalance == 0 { // retired and settled: nothing to show
			continue
		}
		util, avail := utilization(r.CurrentBalance, pm.CreditLimit)
		out = append(out, CardSummary{PaymentMethodID: pm.ID, Nickname: pm.Nickname, Color: pm.Color, Last4: pm.Last4,
			CurrentBalance: r.CurrentBalance, CreditLimit: pm.CreditLimit, AvailableCredit: avail, Utilization: util,
			Cycle: datex.NewMonth(r.Cycle), AmountDue: r.AmountDue, DueOn: datex.NewDate(r.Due)})
	}
	return out, nil
}

// Upcoming lists pending fixed payments due within `days` (plus overdue ones
// from the last 30 days) and credit-card payments due in the window. MSI
// installments are inside each card's amount due, so they are not listed alone.
func (s *Service) Upcoming(ctx context.Context, a Actor, days int) ([]UpcomingItem, error) {
	if days < 7 || days > 60 {
		return nil, apperr.Validation(map[string]string{"days": "must be between 7 and 60"})
	}
	today := s.today(a)
	until := today.AddDate(0, 0, days)
	if err := s.ensureRange(ctx, a, today.AddDate(0, 0, -30), until); err != nil {
		return nil, err
	}
	rows, err := s.q.UpcomingFixedEntries(ctx, store.UpcomingFixedEntriesParams{UserID: a.UserID, FromDate: today.AddDate(0, 0, -30), ToDate: until})
	if err != nil {
		return nil, err
	}
	out := []UpcomingItem{}
	for _, e := range rows {
		id := e.ID
		out = append(out, UpcomingItem{Type: "fixed", Date: datex.NewDate(e.DueDate), Name: e.Name, Amount: e.Amount,
			EntryID: &id, PaymentMethodID: e.PaymentMethodID, Overdue: e.DueDate.Before(today)})
	}
	cardsDue, err := s.CardsOverview(ctx, a)
	if err != nil {
		return nil, err
	}
	for _, c := range cardsDue {
		if c.AmountDue > 0 && !c.DueOn.Before(today) && !c.DueOn.After(until) {
			id := c.PaymentMethodID
			out = append(out, UpcomingItem{Type: "card", Date: c.DueOn, Name: c.Nickname, Amount: c.AmountDue, PaymentMethodID: &id})
		}
	}
	slices.SortStableFunc(out, func(x, y UpcomingItem) int { return cmp.Compare(x.Date.Unix(), y.Date.Unix()) })
	return out, nil
}
