package savings

import (
	"cmp"
	"math"
	"slices"
	"strings"
)

// Deposit-insurance cover per person per institution, in UDIs (IPAB for banks, PROSOFIPO for SOFIPOs).
const (
	BankUDIs   int64 = 400_000
	SofipoUDIs int64 = 25_000
)

// InsuredUDIs is the cover for an account kind, or 0 when that kind has no deposit insurance.
func InsuredUDIs(kind string) int64 {
	switch kind {
	case "bank":
		return BankUDIs
	case "sofipo":
		return SofipoUDIs
	}
	return 0
}

// LimitCents converts a UDI cover to cents at the configured UDI value (pesos per UDI).
func LimitCents(udis int64, udiValue float64) int64 {
	return int64(math.Round(float64(udis) * udiValue * 100))
}

type Holding struct {
	Kind        string
	Institution string
	Balance     int64
}

type Warning struct {
	Institution string
	Kind        string
	Total       int64
	Limit       int64
	Excess      int64
}

// InsuranceWarnings sums insured holdings per (institution, kind), where the institution name is
// compared case- and space-insensitively, and returns the groups above their limit.
func InsuranceWarnings(hs []Holding, udiValue float64) []Warning {
	type key struct{ inst, kind string }
	groups := map[key]*Warning{}
	var order []key
	for _, h := range hs {
		udis := InsuredUDIs(h.Kind)
		if udis == 0 {
			continue
		}
		k := key{strings.ToLower(strings.Join(strings.Fields(h.Institution), " ")), h.Kind}
		w, ok := groups[k]
		if !ok {
			w = &Warning{Institution: strings.Join(strings.Fields(h.Institution), " "), Kind: h.Kind, Limit: LimitCents(udis, udiValue)}
			groups[k] = w
			order = append(order, k)
		}
		w.Total += h.Balance
	}
	out := []Warning{}
	for _, k := range order {
		if w := groups[k]; w.Total > w.Limit {
			w.Excess = w.Total - w.Limit
			out = append(out, *w)
		}
	}
	slices.SortStableFunc(out, func(a, b Warning) int { return cmp.Compare(b.Excess, a.Excess) })
	return out
}

type Slice struct {
	Kind   string
	Amount int64
	Pct    int32
}

// Allocation splits the positive balances by account kind, largest first.
func Allocation(hs []Holding) []Slice {
	sums := map[string]int64{}
	var total int64
	for _, h := range hs {
		if h.Balance > 0 {
			sums[h.Kind] += h.Balance
			total += h.Balance
		}
	}
	out := []Slice{}
	for k, v := range sums {
		out = append(out, Slice{Kind: k, Amount: v, Pct: int32(math.Round(float64(v) * 100 / float64(total)))})
	}
	slices.SortFunc(out, func(a, b Slice) int {
		if c := cmp.Compare(b.Amount, a.Amount); c != 0 {
			return c
		}
		return cmp.Compare(a.Kind, b.Kind)
	})
	return out
}
