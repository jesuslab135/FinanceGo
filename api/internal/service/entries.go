package service

import (
	"context"
	"time"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/store"
)

const maxMonthsAhead = 12

type Entry struct {
	ID                int64       `json:"id"`
	Month             datex.Month `json:"month"`
	Kind              string      `json:"kind"`
	IncomeSourceID    *int64      `json:"income_source_id"`
	FixedPaymentID    *int64      `json:"fixed_payment_id"`
	InstallmentPlanID *int64      `json:"installment_plan_id"`
	InstallmentNo     *int32      `json:"installment_no"`
	Name              string      `json:"name"`
	CategoryID        *int64      `json:"category_id"`
	PaymentMethodID   *int64      `json:"payment_method_id"`
	Amount            int64       `json:"amount"`
	DueDate           datex.Date  `json:"due_date"`
	Status            string      `json:"status"`
	SettledOn         *datex.Date `json:"settled_on"`
	Edited            bool        `json:"edited"`
}

type EntryUpdate struct {
	Amount          int64       `json:"amount"`
	Status          string      `json:"status"`
	SettledOn       *datex.Date `json:"settled_on"`
	PaymentMethodID *int64      `json:"payment_method_id"`
}

func toEntry(e store.MonthlyEntry) Entry {
	return Entry{
		ID: e.ID, Month: datex.NewMonth(e.Month), Kind: e.Kind, IncomeSourceID: e.IncomeSourceID, FixedPaymentID: e.FixedPaymentID,
		InstallmentPlanID: e.InstallmentPlanID, InstallmentNo: e.InstallmentNo, Name: e.Name, CategoryID: e.CategoryID,
		PaymentMethodID: e.PaymentMethodID, Amount: e.Amount, DueDate: datex.NewDate(e.DueDate), Status: e.Status,
		SettledOn: datex.DatePtr(e.SettledOn), Edited: e.Edited,
	}
}

// ensureMonth materializes the month's income and fixed rows from active
// templates. It is idempotent and safe under concurrency (ON CONFLICT DO NOTHING).
func (s *Service) ensureMonth(ctx context.Context, q *store.Queries, a Actor, month time.Time) error {
	month = datex.MonthStart(month)
	if datex.MonthsBetween(datex.MonthStart(s.today(a)), month) > maxMonthsAhead {
		return apperr.MonthOutOfRange()
	}
	if err := q.EnsureIncomeEntries(ctx, store.EnsureIncomeEntriesParams{UserID: a.UserID, Month: month}); err != nil {
		return err
	}
	if err := q.EnsureFixedEntries(ctx, store.EnsureFixedEntriesParams{UserID: a.UserID, Month: month}); err != nil {
		return err
	}
	return s.ensureInstallments(ctx, q, a.UserID, month)
}

func (s *Service) MonthEntries(ctx context.Context, a Actor, month time.Time) ([]Entry, error) {
	month = datex.MonthStart(month)
	if err := s.ensureMonth(ctx, s.q, a, month); err != nil {
		return nil, err
	}
	rows, err := s.q.ListMonthEntries(ctx, store.ListMonthEntriesParams{UserID: a.UserID, Month: month})
	if err != nil {
		return nil, err
	}
	out := make([]Entry, len(rows))
	for i, r := range rows {
		out[i] = toEntry(r)
	}
	return out, nil
}

func (s *Service) UpdateEntry(ctx context.Context, a Actor, id int64, in EntryUpdate) (Entry, error) {
	var out Entry
	err := s.inTx(ctx, func(q *store.Queries) error {
		e, err := q.GetEntry(ctx, store.GetEntryParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		var v apperr.V
		checkAmount(&v, "amount", in.Amount)
		if e.Kind == "income" {
			v.Check(in.Status == "pending" || in.Status == "received" || in.Status == "skipped", "status", "must be pending, received or skipped")
			v.Check(in.PaymentMethodID == nil, "payment_method_id", "is not allowed on income")
		} else {
			v.Check(in.Status == "pending" || in.Status == "paid" || in.Status == "skipped", "status", "must be pending, paid or skipped")
		}
		if in.SettledOn != nil {
			earliest, latest := e.Month.AddDate(0, 0, -31), s.today(a).AddDate(0, 0, 1)
			v.Check(!in.SettledOn.Before(earliest) && !in.SettledOn.After(latest), "settled_on",
				"must be between "+earliest.Format(time.DateOnly)+" and "+latest.Format(time.DateOnly))
		}
		if e.Kind == "installment" {
			v.Check(in.Amount == e.Amount, "amount", "installment amounts are set by the plan")
			v.Check(eqPtr(in.PaymentMethodID, e.PaymentMethodID), "payment_method_id", "installments stay on the plan's card")
		}
		if err := v.Err(); err != nil {
			return err
		}
		if _, err := s.checkPaymentMethodRef(ctx, q, a.UserID, in.PaymentMethodID, "payment_method_id", false); err != nil {
			return err
		}
		var settled *time.Time
		if in.Status == "paid" || in.Status == "received" {
			d := s.today(a)
			if in.SettledOn != nil {
				d = in.SettledOn.Time
			}
			settled = &d
		}
		edited := e.Edited || in.Amount != e.Amount || !eqPtr(in.PaymentMethodID, e.PaymentMethodID)
		u, err := q.UpdateEntry(ctx, store.UpdateEntryParams{
			ID: id, UserID: a.UserID, Amount: in.Amount, Status: in.Status, SettledOn: settled,
			PaymentMethodID: in.PaymentMethodID, Edited: edited,
		})
		if err != nil {
			return err
		}
		out = toEntry(u)
		return nil
	})
	return out, err
}
