package savings

import (
	"math"
	"testing"
	"time"
)

func d(s string) time.Time {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return t
}

func ptr[T any](v T) *T { return &v }

var cajita = Account{ID: 1, Kind: "bank", Institution: "Nu", OpeningBalance: 100_000, OpeningDate: d("2026-01-10")}

func TestFlow(t *testing.T) {
	cases := []struct {
		m    Movement
		id   int64
		want int64
	}{
		{Movement{AccountID: 1, Kind: KindDeposit, Amount: 500}, 1, 500},
		{Movement{AccountID: 1, Kind: KindWithdrawal, Amount: 500}, 1, -500},
		{Movement{AccountID: 1, Kind: KindTransfer, ToAccountID: ptr[int64](2), Amount: 500}, 1, -500},
		{Movement{AccountID: 1, Kind: KindTransfer, ToAccountID: ptr[int64](2), Amount: 500}, 2, 500},
		{Movement{AccountID: 1, Kind: KindDeposit, Amount: 500}, 3, 0},
	}
	for i, c := range cases {
		if got := Flow(c.m, c.id); got != c.want {
			t.Errorf("case %d: Flow = %d, want %d", i, got, c.want)
		}
	}
}

func TestBalanceFromOpeningAndMovements(t *testing.T) {
	moves := []Movement{
		{AccountID: 1, Kind: KindDeposit, Amount: 20_000, On: d("2026-01-10")}, // same day as opening counts
		{AccountID: 1, Kind: KindWithdrawal, Amount: 5_000, On: d("2026-02-01")},
		{AccountID: 1, Kind: KindDeposit, Amount: 9_999, On: d("2026-04-01")}, // after t
	}
	bal, anchor := Balance(cajita, nil, moves, d("2026-03-15"))
	if bal != 115_000 || !anchor.Equal(d("2026-01-10")) {
		t.Fatalf("Balance = %d @ %s, want 115000 @ 2026-01-10", bal, anchor.Format(time.DateOnly))
	}
}

func TestBalanceIgnoresMovementsCoveredByValuation(t *testing.T) {
	vals := []Valuation{{Value: 130_000, On: d("2026-02-28")}, {Value: 120_000, On: d("2026-02-01")}}
	moves := []Movement{
		{AccountID: 1, Kind: KindDeposit, Amount: 20_000, On: d("2026-02-15")},   // before the valuation: already in it
		{AccountID: 1, Kind: KindWithdrawal, Amount: 1_000, On: d("2026-02-28")}, // same day: already in it
		{AccountID: 1, Kind: KindDeposit, Amount: 3_000, On: d("2026-03-01")},    // after: added
	}
	bal, anchor := Balance(cajita, vals, moves, d("2026-03-15"))
	if bal != 133_000 || !anchor.Equal(d("2026-02-28")) {
		t.Fatalf("Balance = %d @ %s, want 133000 @ 2026-02-28", bal, anchor.Format(time.DateOnly))
	}
	// Put in still counts every movement: 100000 + 20000 − 1000 + 3000.
	if p := PutIn(cajita, moves, d("2026-03-15")); p != 122_000 {
		t.Fatalf("PutIn = %d, want 122000", p)
	}
	// As of a date before the newest valuation, the older one anchors.
	if bal, _ := Balance(cajita, vals, moves, d("2026-02-20")); bal != 140_000 {
		t.Fatalf("Balance on 02-20 = %d, want 140000 (120000 + 20000)", bal)
	}
}

func TestAccountStatsGainYieldAndStale(t *testing.T) {
	a := cajita
	a.RateBP = ptr[int32](1300)
	vals := []Valuation{{Value: 110_000, On: d("2026-02-01")}}
	s := AccountStats(a, vals, nil, d("2026-03-15")) // 42 days after the anchor
	if s.Balance != 110_000 || s.PutIn != 100_000 || s.Gain != 10_000 {
		t.Fatalf("stats %+v", s)
	}
	if s.GainPct == nil || *s.GainPct != 10 {
		t.Fatalf("GainPct = %v, want 10", s.GainPct)
	}
	// 110000 × 13% × 42/365 = 1645.48 → 1645
	if s.EstimatedYield == nil || *s.EstimatedYield != 1645 {
		t.Fatalf("EstimatedYield = %v, want 1645", s.EstimatedYield)
	}
	if !s.Stale {
		t.Fatal("42 days without a valuation must be stale")
	}
	if s := AccountStats(a, vals, nil, d("2026-03-03")); s.Stale { // exactly 30 days
		t.Fatal("30 days is not stale yet")
	}
}

func TestAccountStatsZeroPutIn(t *testing.T) {
	a := Account{ID: 9, OpeningDate: d("2026-03-01")}
	s := AccountStats(a, nil, nil, d("2026-03-15"))
	if s.GainPct != nil || s.EstimatedYield != nil || s.Balance != 0 {
		t.Fatalf("empty account stats %+v", s)
	}
}

func TestAccountStatsYieldNoOverflow(t *testing.T) {
	a := Account{ID: 1, OpeningBalance: 999_999_999_999, OpeningDate: d("2016-01-01"), RateBP: ptr[int32](10000)}
	s := AccountStats(a, nil, nil, d("2026-01-01"))
	want := int64(math.Round(999_999_999_999 * 1.0 * float64(d("2026-01-01").Sub(d("2016-01-01")).Hours()/24) / 365))
	// ±1 cent: the float operations may be ordered differently, but the value must be positive and not wrapped.
	if s.EstimatedYield == nil || *s.EstimatedYield <= 0 || *s.EstimatedYield < want-1 || *s.EstimatedYield > want+1 {
		t.Fatalf("EstimatedYield = %v, want %d", s.EstimatedYield, want)
	}
}
