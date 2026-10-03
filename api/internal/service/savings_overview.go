package service

import (
	"context"
	"time"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/savings"
)

const maxSeriesMonths = 24

type SavingsMonth struct {
	Planned   int64 `json:"planned" validate:"required"`
	Deposited int64 `json:"deposited" validate:"required"`
	Withdrawn int64 `json:"withdrawn" validate:"required"`
	Saved     int64 `json:"saved" validate:"required"`
}

type AllocationSlice struct {
	Kind   string `json:"kind" validate:"required"`
	Amount int64  `json:"amount" validate:"required"`
	Pct    int32  `json:"pct" validate:"required"`
}

type InsuranceWarning struct {
	Institution string `json:"institution" validate:"required"`
	Kind        string `json:"kind" validate:"required"`
	Total       int64  `json:"total" validate:"required"`
	Limit       int64  `json:"limit" validate:"required"`
	Excess      int64  `json:"excess" validate:"required"`
}

type SavingsOverview struct {
	NetWorth          int64              `json:"net_worth" validate:"required"`
	Assets            int64              `json:"assets" validate:"required"`
	CardDebt          int64              `json:"card_debt" validate:"required"`
	Month             SavingsMonth       `json:"month" validate:"required"`
	Allocation        []AllocationSlice  `json:"allocation" validate:"required"`
	InsuranceWarnings []InsuranceWarning `json:"insurance_warnings" validate:"required"`
	UDIValue          float64            `json:"udi_value" validate:"required"`
}

type SavingsPoint struct {
	Month datex.Month `json:"month" validate:"required"`
	Value int64       `json:"value" validate:"required"`
	PutIn int64       `json:"put_in" validate:"required"`
}

func (s *Service) SavingsOverview(ctx context.Context, a Actor) (SavingsOverview, error) {
	today := s.today(a)
	d, err := s.loadSavings(ctx, s.q, a.UserID)
	if err != nil {
		return SavingsOverview{}, err
	}
	cards, err := s.CardsOverview(ctx, a)
	if err != nil {
		return SavingsOverview{}, err
	}
	out := SavingsOverview{UDIValue: s.udiValue, Allocation: []AllocationSlice{}, InsuranceWarnings: []InsuranceWarning{}}
	var hs []savings.Holding
	for _, acc := range d.accounts {
		if acc.ArchivedOn != nil {
			continue
		}
		b := d.balance(acc.ID, today)
		out.Assets += b
		hs = append(hs, savings.Holding{Kind: acc.Kind, Institution: acc.Institution, Balance: b})
	}
	for _, c := range cards {
		out.CardDebt += c.CurrentBalance
	}
	out.NetWorth = out.Assets - out.CardDebt
	out.Month = SavingsMonth(savings.MonthSaved(d.mathGoals(), d.moves, datex.MonthStart(today), today))
	for _, sl := range savings.Allocation(hs) {
		out.Allocation = append(out.Allocation, AllocationSlice(sl))
	}
	for _, w := range savings.InsuranceWarnings(hs, s.udiValue) {
		out.InsuranceWarnings = append(out.InsuranceWarnings, InsuranceWarning(w))
	}
	return out, nil
}

// SavingsSeries gives, for each month from..to, the total value and money put in at the month's
// end (today for the current month). Archived accounts count through the month they were archived.
func (s *Service) SavingsSeries(ctx context.Context, a Actor, from, to time.Time) ([]SavingsPoint, error) {
	today := s.today(a)
	cur := datex.MonthStart(today)
	from, to = datex.MonthStart(from), datex.MonthStart(to)
	var v apperr.V
	v.Check(!to.Before(from), "to", "must not be before from")
	v.Check(!to.After(cur), "to", "must not be after the current month")
	v.Check(datex.MonthsBetween(from, to) < maxSeriesMonths, "from", "must be within 24 months of to")
	if err := v.Err(); err != nil {
		return nil, err
	}
	d, err := s.loadSavings(ctx, s.q, a.UserID)
	if err != nil {
		return nil, err
	}
	out := []SavingsPoint{}
	for m := from; !m.After(to); m = datex.AddMonths(m, 1) {
		end := datex.AddMonths(m, 1).AddDate(0, 0, -1)
		if end.After(today) {
			end = today
		}
		p := SavingsPoint{Month: datex.NewMonth(m)}
		for _, acc := range d.accounts {
			if acc.OpeningDate.After(end) || (acc.ArchivedOn != nil && datex.MonthStart(*acc.ArchivedOn).Before(m)) {
				continue
			}
			ma := mathAccount(acc)
			b, _ := savings.Balance(ma, d.vals[acc.ID], d.moves, end)
			p.Value += b
			p.PutIn += savings.PutIn(ma, d.moves, end)
		}
		out = append(out, p)
	}
	return out, nil
}
