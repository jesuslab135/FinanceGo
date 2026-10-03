// Package savings holds the pure savings-and-investments math: account balances,
// goal progress and status, the monthly Saved line, and deposit-insurance limits.
package savings

import (
	"math"
	"time"
)

const (
	KindDeposit    = "deposit"
	KindWithdrawal = "withdrawal"
	KindTransfer   = "transfer"
)

// StaleAfterDays is how long an account can go without a valuation before the UI nudges the user.
const StaleAfterDays = 30

type Movement struct {
	ID          int64
	AccountID   int64
	ToAccountID *int64
	GoalID      *int64
	Kind        string
	Amount      int64
	On          time.Time
}

type Valuation struct {
	Value int64
	On    time.Time
}

type Account struct {
	ID             int64
	Kind           string
	Institution    string
	OpeningBalance int64
	OpeningDate    time.Time
	RateBP         *int32
	ArchivedOn     *time.Time
}

// Flow is m's signed effect on account id: + money in, − money out, 0 when m does not touch id.
func Flow(m Movement, id int64) int64 {
	switch {
	case m.AccountID == id && m.Kind == KindDeposit:
		return m.Amount
	case m.AccountID == id: // withdrawal, or transfer out
		return -m.Amount
	case m.Kind == KindTransfer && m.ToAccountID != nil && *m.ToAccountID == id:
		return m.Amount
	}
	return 0
}

// Balance is a's value at the end of day t. It starts from the latest valuation on or before t
// (which already includes every movement dated on or before it), or else from the opening balance,
// and adds the movements after that anchor.
func Balance(a Account, vals []Valuation, moves []Movement, t time.Time) (balance int64, anchor time.Time) {
	balance, anchor = a.OpeningBalance, a.OpeningDate
	fromValuation := false
	for _, v := range vals {
		if !v.On.After(t) && (!fromValuation || v.On.After(anchor)) {
			balance, anchor, fromValuation = v.Value, v.On, true
		}
	}
	for _, m := range moves {
		if m.On.After(t) || (fromValuation && !m.On.After(anchor)) {
			continue
		}
		balance += Flow(m, a.ID)
	}
	return balance, anchor
}

// PutIn is what the user put into a up to day t: the opening balance plus every net movement.
func PutIn(a Account, moves []Movement, t time.Time) int64 {
	sum := a.OpeningBalance
	for _, m := range moves {
		if !m.On.After(t) {
			sum += Flow(m, a.ID)
		}
	}
	return sum
}

type Stats struct {
	Balance        int64
	PutIn          int64
	Gain           int64
	GainPct        *float64 // percent with two decimals (12.34 = 12.34 %); nil when PutIn <= 0
	EstimatedYield *int64   // simple interest since the anchor; nil without a rate or balance
	AnchorDate     time.Time
	Stale          bool
}

func AccountStats(a Account, vals []Valuation, moves []Movement, today time.Time) Stats {
	bal, anchor := Balance(a, vals, moves, today)
	s := Stats{Balance: bal, PutIn: PutIn(a, moves, today), AnchorDate: anchor}
	s.Gain = s.Balance - s.PutIn
	if s.PutIn > 0 {
		pct := math.Round(float64(s.Gain)/float64(s.PutIn)*10000) / 100
		s.GainPct = &pct
	}
	days := math.Round(today.Sub(anchor).Hours() / 24)
	s.Stale = days > StaleAfterDays
	if a.RateBP != nil && bal > 0 {
		// Float math: cents × basis points × days overflows int64 for large balances.
		y := int64(math.Round(float64(bal) * float64(*a.RateBP) / 10000 * days / 365))
		s.EstimatedYield = &y
	}
	return s
}
