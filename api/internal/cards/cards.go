// Package cards computes credit-card statement cycles, MSI installment
// billing and balances. It is pure: no I/O, UTC-midnight dates only.
package cards

import (
	"time"

	"financego/internal/datex"
)

type Movement struct {
	Date   time.Time
	Amount int64
}

type Plan struct {
	ID          int64
	Total       int64
	N           int
	PurchasedOn time.Time
	CancelledOn *time.Time
}

type Card struct {
	StatementDay   int
	DueDay         int
	OpeningBalance int64
	OpeningDate    time.Time
}

type Result struct {
	Cycle, Opens, Closes, Due time.Time
	BilledBalance             int64
	AmountDue                 int64
	CurrentBalance            int64
}

// CycleClose is the statement (cut-off) date of the cycle whose month is `cycle`.
func CycleClose(cycle time.Time, statementDay int) time.Time { return datex.Clamp(cycle, statementDay) }

// CycleOpen is the day after the previous cycle's close.
func CycleOpen(cycle time.Time, statementDay int) time.Time {
	return CycleClose(datex.AddMonths(datex.MonthStart(cycle), -1), statementDay).AddDate(0, 0, 1)
}

// CycleFor returns the cycle containing d; the close day belongs to its cycle.
func CycleFor(d time.Time, statementDay int) time.Time {
	m := datex.MonthStart(d)
	if d.After(CycleClose(m, statementDay)) {
		return datex.AddMonths(m, 1)
	}
	return m
}

// DueDate is the first occurrence of dueDay strictly after closeDate.
func DueDate(closeDate time.Time, dueDay int) time.Time {
	due := datex.Clamp(closeDate, dueDay)
	if !due.After(closeDate) {
		due = datex.Clamp(datex.AddMonths(datex.MonthStart(closeDate), 1), dueDay)
	}
	return due
}

// RelevantCycle is the statement the user should be paying now: the last closed
// cycle while its due date has not passed, otherwise the open cycle.
func RelevantCycle(today time.Time, statementDay, dueDay int) time.Time {
	cur := CycleFor(today, statementDay)
	prev := datex.AddMonths(cur, -1)
	if !DueDate(CycleClose(prev, statementDay), dueDay).Before(today) {
		return prev
	}
	return cur
}

// Installments splits total into n parts; the last absorbs the remainder.
func Installments(total int64, n int) []int64 {
	base := total / int64(n)
	out := make([]int64, n)
	for i := range out {
		out[i] = base
	}
	out[n-1] += total - base*int64(n)
	return out
}

// InstallmentCycle is the cycle in which installment k (1-based) is billed.
func InstallmentCycle(p Plan, statementDay, k int) time.Time {
	return datex.AddMonths(CycleFor(p.PurchasedOn, statementDay), k-1)
}

// InstallmentIn returns the installment number billed in cycle, or 0.
func InstallmentIn(p Plan, statementDay int, cycle time.Time) int {
	k := datex.MonthsBetween(CycleFor(p.PurchasedOn, statementDay), cycle) + 1
	if k < 1 || k > p.N {
		return 0
	}
	if p.CancelledOn != nil && CycleClose(cycle, statementDay).After(*p.CancelledOn) {
		return 0
	}
	return k
}

// Billed counts and sums installments whose cycle closed on or before asOf
// (and not after the plan was cancelled).
func Billed(p Plan, statementDay int, asOf time.Time) (count int, amount int64) {
	amts := Installments(p.Total, p.N)
	for k := 1; k <= p.N; k++ {
		closeDate := CycleClose(InstallmentCycle(p, statementDay, k), statementDay)
		if closeDate.After(asOf) || (p.CancelledOn != nil && closeDate.After(*p.CancelledOn)) {
			break
		}
		count++
		amount += amts[k-1]
	}
	return count, amount
}

// Debt is what the plan adds to the card balance: the full total while active,
// only the installments billed up to cancellation otherwise.
func Debt(p Plan, statementDay int) int64 {
	if p.CancelledOn == nil {
		return p.Total
	}
	_, amt := Billed(p, statementDay, *p.CancelledOn)
	return amt
}

func Compute(c Card, charges, payments []Movement, plans []Plan, cycle time.Time) Result {
	cycle = datex.MonthStart(cycle)
	r := Result{Cycle: cycle, Opens: CycleOpen(cycle, c.StatementDay), Closes: CycleClose(cycle, c.StatementDay)}
	r.Due = DueDate(r.Closes, c.DueDay)
	r.BilledBalance, r.CurrentBalance = c.OpeningBalance, c.OpeningBalance
	var paidAfterClose int64
	for _, m := range charges {
		if m.Date.Before(c.OpeningDate) {
			continue
		}
		r.CurrentBalance += m.Amount
		if !m.Date.After(r.Closes) {
			r.BilledBalance += m.Amount
		}
	}
	for _, m := range payments {
		if m.Date.Before(c.OpeningDate) {
			continue
		}
		r.CurrentBalance -= m.Amount
		switch {
		case !m.Date.After(r.Closes):
			r.BilledBalance -= m.Amount
		case !m.Date.After(r.Due):
			paidAfterClose += m.Amount
		}
	}
	for _, p := range plans {
		r.CurrentBalance += Debt(p, c.StatementDay)
		_, amt := Billed(p, c.StatementDay, r.Closes)
		r.BilledBalance += amt
	}
	r.AmountDue = max(0, r.BilledBalance-paidAfterClose)
	return r
}
