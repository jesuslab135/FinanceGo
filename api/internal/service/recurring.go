package service

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/store"
)

type IncomeSource struct {
	ID         int64        `json:"id"`
	CategoryID *int64       `json:"category_id"`
	Name       string       `json:"name"`
	Amount     int64        `json:"amount"`
	DayOfMonth int32        `json:"day_of_month"`
	StartMonth datex.Month  `json:"start_month"`
	EndMonth   *datex.Month `json:"end_month"`
	Active     bool         `json:"active"`
}

type IncomeSourceInput struct {
	CategoryID *int64       `json:"category_id"`
	Name       string       `json:"name"`
	Amount     int64        `json:"amount"`
	DayOfMonth int32        `json:"day_of_month"`
	StartMonth datex.Month  `json:"start_month"`
	EndMonth   *datex.Month `json:"end_month"`
	Active     *bool        `json:"active"`
}

type FixedPayment struct {
	ID              int64        `json:"id"`
	CategoryID      int64        `json:"category_id"`
	PaymentMethodID *int64       `json:"payment_method_id"`
	Name            string       `json:"name"`
	Amount          int64        `json:"amount"`
	DayOfMonth      int32        `json:"day_of_month"`
	StartMonth      datex.Month  `json:"start_month"`
	EndMonth        *datex.Month `json:"end_month"`
	Active          bool         `json:"active"`
}

type FixedPaymentInput struct {
	CategoryID      int64        `json:"category_id"`
	PaymentMethodID *int64       `json:"payment_method_id"`
	Name            string       `json:"name"`
	Amount          int64        `json:"amount"`
	DayOfMonth      int32        `json:"day_of_month"`
	StartMonth      datex.Month  `json:"start_month"`
	EndMonth        *datex.Month `json:"end_month"`
	Active          *bool        `json:"active"`
}

func toIncomeSource(r store.IncomeSource) IncomeSource {
	return IncomeSource{ID: r.ID, CategoryID: r.CategoryID, Name: r.Name, Amount: r.Amount, DayOfMonth: r.DayOfMonth,
		StartMonth: datex.NewMonth(r.StartMonth), EndMonth: datex.MonthPtr(r.EndMonth), Active: r.Active}
}

func toFixedPayment(r store.FixedPayment) FixedPayment {
	return FixedPayment{ID: r.ID, CategoryID: r.CategoryID, PaymentMethodID: r.PaymentMethodID, Name: r.Name, Amount: r.Amount,
		DayOfMonth: r.DayOfMonth, StartMonth: datex.NewMonth(r.StartMonth), EndMonth: datex.MonthPtr(r.EndMonth), Active: r.Active}
}

func checkTemplate(v *apperr.V, name *string, amount int64, day int32, start datex.Month, end *datex.Month, active **bool) {
	*name = strings.TrimSpace(*name)
	n := utf8.RuneCountInString(*name)
	v.Check(n >= 1 && n <= 80, "name", "must be 1-80 characters")
	checkAmount(v, "amount", amount)
	v.Check(day >= 1 && day <= 31, "day_of_month", "must be between 1 and 31")
	v.Check(!start.IsZero(), "start_month", "is required")
	v.Check(end == nil || !end.Before(start.Time), "end_month", "must not be before start_month")
	if *active == nil {
		t := true
		*active = &t
	}
}

// inactiveEnd is the end_month stored for a template saved with the given
// active flag. Deactivating ends it at the current month (user tz) so months up
// to then keep generating its rows; a template that has not started yet gets
// no end_month and, being inactive, generates nothing (the DB requires
// end_month >= start_month). Active templates keep the client value.
func (s *Service) inactiveEnd(a Actor, active bool, start datex.Month, end *datex.Month) *datex.Month {
	if active {
		return end
	}
	cur := datex.MonthStart(s.today(a))
	if cur.Before(start.Time) {
		return nil
	}
	if end != nil && end.Before(cur) {
		return end
	}
	m := datex.NewMonth(cur)
	return &m
}

func monthOrNil(m *datex.Month) *time.Time {
	if m == nil {
		return nil
	}
	t := m.Time
	return &t
}

func (s *Service) validateIncome(ctx context.Context, q *store.Queries, a Actor, in *IncomeSourceInput) error {
	var v apperr.V
	checkTemplate(&v, &in.Name, in.Amount, in.DayOfMonth, in.StartMonth, in.EndMonth, &in.Active)
	if err := v.Err(); err != nil {
		return err
	}
	if in.CategoryID != nil {
		return s.checkCategoryRef(ctx, q, a.UserID, *in.CategoryID, "income", "category_id")
	}
	return nil
}

func (s *Service) validateFixed(ctx context.Context, q *store.Queries, a Actor, in *FixedPaymentInput) error {
	var v apperr.V
	checkTemplate(&v, &in.Name, in.Amount, in.DayOfMonth, in.StartMonth, in.EndMonth, &in.Active)
	v.Check(in.CategoryID > 0, "category_id", "is required")
	if err := v.Err(); err != nil {
		return err
	}
	if err := s.checkCategoryRef(ctx, q, a.UserID, in.CategoryID, "expense", "category_id"); err != nil {
		return err
	}
	_, err := s.checkPaymentMethodRef(ctx, q, a.UserID, in.PaymentMethodID, "payment_method_id", false)
	return err
}

func (s *Service) ListIncomeSources(ctx context.Context, a Actor) ([]IncomeSource, error) {
	rows, err := s.q.ListIncomeSources(ctx, a.UserID)
	if err != nil {
		return nil, err
	}
	out := make([]IncomeSource, len(rows))
	for i, r := range rows {
		out[i] = toIncomeSource(r)
	}
	return out, nil
}

func (s *Service) CreateIncomeSource(ctx context.Context, a Actor, in IncomeSourceInput) (IncomeSource, error) {
	if err := s.validateIncome(ctx, s.q, a, &in); err != nil {
		return IncomeSource{}, err
	}
	r, err := s.q.CreateIncomeSource(ctx, store.CreateIncomeSourceParams{
		UserID: a.UserID, CategoryID: in.CategoryID, Name: in.Name, Amount: in.Amount, DayOfMonth: in.DayOfMonth,
		StartMonth: in.StartMonth.Time, EndMonth: monthOrNil(in.EndMonth), Active: *in.Active,
	})
	if err != nil {
		return IncomeSource{}, err
	}
	return toIncomeSource(r), nil
}

func (s *Service) UpdateIncomeSource(ctx context.Context, a Actor, id int64, in IncomeSourceInput) (IncomeSource, error) {
	var out IncomeSource
	err := s.inTx(ctx, func(q *store.Queries) error {
		if err := s.validateIncome(ctx, q, a, &in); err != nil {
			return err
		}
		in.EndMonth = s.inactiveEnd(a, *in.Active, in.StartMonth, in.EndMonth)
		r, err := q.UpdateIncomeSource(ctx, store.UpdateIncomeSourceParams{
			ID: id, UserID: a.UserID, CategoryID: in.CategoryID, Name: in.Name, Amount: in.Amount, DayOfMonth: in.DayOfMonth,
			StartMonth: in.StartMonth.Time, EndMonth: monthOrNil(in.EndMonth), Active: *in.Active,
		})
		if err != nil {
			return notFound(err)
		}
		out = toIncomeSource(r)
		return s.afterIncomeChange(ctx, q, a, id)
	})
	return out, err
}

func (s *Service) DeactivateIncomeSource(ctx context.Context, a Actor, id int64) (IncomeSource, error) {
	var out IncomeSource
	err := s.inTx(ctx, func(q *store.Queries) error {
		r, err := q.DeactivateIncomeSource(ctx, store.DeactivateIncomeSourceParams{ID: id, UserID: a.UserID, CurrentMonth: datex.MonthStart(s.today(a))})
		if err != nil {
			return notFound(err)
		}
		out = toIncomeSource(r)
		return s.afterIncomeChange(ctx, q, a, id)
	})
	return out, err
}

func (s *Service) ListFixedPayments(ctx context.Context, a Actor) ([]FixedPayment, error) {
	rows, err := s.q.ListFixedPayments(ctx, a.UserID)
	if err != nil {
		return nil, err
	}
	out := make([]FixedPayment, len(rows))
	for i, r := range rows {
		out[i] = toFixedPayment(r)
	}
	return out, nil
}

func (s *Service) CreateFixedPayment(ctx context.Context, a Actor, in FixedPaymentInput) (FixedPayment, error) {
	if err := s.validateFixed(ctx, s.q, a, &in); err != nil {
		return FixedPayment{}, err
	}
	r, err := s.q.CreateFixedPayment(ctx, store.CreateFixedPaymentParams{
		UserID: a.UserID, CategoryID: in.CategoryID, PaymentMethodID: in.PaymentMethodID, Name: in.Name, Amount: in.Amount,
		DayOfMonth: in.DayOfMonth, StartMonth: in.StartMonth.Time, EndMonth: monthOrNil(in.EndMonth), Active: *in.Active,
	})
	if err != nil {
		return FixedPayment{}, err
	}
	return toFixedPayment(r), nil
}

func (s *Service) UpdateFixedPayment(ctx context.Context, a Actor, id int64, in FixedPaymentInput) (FixedPayment, error) {
	var out FixedPayment
	err := s.inTx(ctx, func(q *store.Queries) error {
		if err := s.validateFixed(ctx, q, a, &in); err != nil {
			return err
		}
		in.EndMonth = s.inactiveEnd(a, *in.Active, in.StartMonth, in.EndMonth)
		r, err := q.UpdateFixedPayment(ctx, store.UpdateFixedPaymentParams{
			ID: id, UserID: a.UserID, CategoryID: in.CategoryID, PaymentMethodID: in.PaymentMethodID, Name: in.Name, Amount: in.Amount,
			DayOfMonth: in.DayOfMonth, StartMonth: in.StartMonth.Time, EndMonth: monthOrNil(in.EndMonth), Active: *in.Active,
		})
		if err != nil {
			return notFound(err)
		}
		out = toFixedPayment(r)
		return s.afterFixedChange(ctx, q, a, id)
	})
	return out, err
}

func (s *Service) DeactivateFixedPayment(ctx context.Context, a Actor, id int64) (FixedPayment, error) {
	var out FixedPayment
	err := s.inTx(ctx, func(q *store.Queries) error {
		r, err := q.DeactivateFixedPayment(ctx, store.DeactivateFixedPaymentParams{ID: id, UserID: a.UserID, CurrentMonth: datex.MonthStart(s.today(a))})
		if err != nil {
			return notFound(err)
		}
		out = toFixedPayment(r)
		return s.afterFixedChange(ctx, q, a, id)
	})
	return out, err
}

// afterIncomeChange pushes template edits into this and future months' pending,
// unedited rows and drops rows that fall outside the template's range.
func (s *Service) afterIncomeChange(ctx context.Context, q *store.Queries, a Actor, id int64) error {
	from := datex.MonthStart(s.today(a))
	if err := q.PropagateIncomeSource(ctx, store.PropagateIncomeSourceParams{SourceID: id, FromMonth: from, UserID: a.UserID}); err != nil {
		return err
	}
	return q.PruneIncomeEntries(ctx, store.PruneIncomeEntriesParams{SourceID: id, FromMonth: from, UserID: a.UserID})
}

func (s *Service) afterFixedChange(ctx context.Context, q *store.Queries, a Actor, id int64) error {
	from := datex.MonthStart(s.today(a))
	if err := q.PropagateFixedPayment(ctx, store.PropagateFixedPaymentParams{SourceID: id, FromMonth: from, UserID: a.UserID}); err != nil {
		return err
	}
	return q.PruneFixedEntries(ctx, store.PruneFixedEntriesParams{SourceID: id, FromMonth: from, UserID: a.UserID})
}
