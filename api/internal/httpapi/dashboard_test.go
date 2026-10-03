package httpapi_test

import (
	"fmt"
	"testing"
	"time"
)

type summary struct {
	Month             string `json:"month"`
	Currency          string `json:"currency"`
	Income            int64  `json:"income"`
	FixedCommitted    int64  `json:"fixed_committed"`
	FixedPaid         int64  `json:"fixed_paid"`
	Installments      int64  `json:"installments"`
	Spent             int64  `json:"spent"`
	Available         int64  `json:"available"`
	SafeToSpendPerDay *int64 `json:"safe_to_spend_per_day"`
	DaysRemaining     *int32 `json:"days_remaining"`
	Budgets           []struct {
		CategoryID int64 `json:"category_id"`
		Limit      int64 `json:"limit"`
		Spent      int64 `json:"spent"`
		Pct        int32 `json:"pct"`
	} `json:"budgets"`
}

func TestSummary(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("sum@example.com")
	cc := h.creditCard(tok)
	h.income(tok, 3000000, 1, "2026-01")
	h.fixed(tok, "Renta", 1000000, 5, "2026-01", nil)
	h.msi(tok, cc, 90000, 3, "2026-03-01")
	h.expense(tok, "Comida", 50000, "2026-03-10", "", &cc)
	h.expense(tok, "Transporte", 20000, "2026-03-15", "", nil)
	h.expense(tok, "Comida", 99999, "2026-02-28", "", nil)
	rent := byKind(h.entries(tok, "2026-03"), "fixed")[0]
	expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", rent.ID), tok, M{"amount": 1000000, "status": "paid"}), 200)

	food := h.catID(tok, "Comida")
	expect[M](t, h.do("PUT", fmt.Sprintf("/api/v1/category-budgets/%d", food), tok, M{"monthly_limit": 100000}), 200)
	if r := h.do("PUT", fmt.Sprintf("/api/v1/category-budgets/%d", h.catID(tok, "Salario")), tok, M{"monthly_limit": 1}); r.Code != 422 {
		t.Fatalf("budget on income category: %d", r.Code)
	}

	s := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-03", tok, nil), 200)
	if s.Income != 3000000 || s.FixedCommitted != 1000000 || s.FixedPaid != 1000000 || s.Installments != 30000 || s.Spent != 70000 {
		t.Fatalf("totals %+v", s)
	}
	if s.Available != 1900000 || s.SafeToSpendPerDay == nil || *s.SafeToSpendPerDay != 111764 || *s.DaysRemaining != 17 || s.Currency != "MXN" {
		t.Fatalf("available %+v", s)
	}
	if len(s.Budgets) != 1 || s.Budgets[0].Spent != 50000 || s.Budgets[0].Pct != 50 {
		t.Fatalf("budgets %+v", s.Budgets)
	}
	feb := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-02", tok, nil), 200)
	if feb.SafeToSpendPerDay != nil || feb.Spent != 99999 {
		t.Fatalf("february %+v", feb)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/category-budgets/%d", food), tok, nil); r.Code != 204 {
		t.Fatalf("delete budget %d", r.Code)
	}
}

func TestSummarySafeToSpendUsesLocalDate(t *testing.T) {
	h := newHarness(t)
	h.setNow(time.Date(2026, 4, 1, 3, 0, 0, 0, time.UTC)) // 2026-03-31 20:00 in Tijuana
	tok := h.signup("tz@example.com")
	expect[M](t, h.do("PUT", "/api/v1/me", tok, M{"name": "Tz", "currency": "MXN", "locale": "es", "timezone": "America/Tijuana"}), 200)
	h.income(tok, 310000, 1, "2026-01")
	s := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary", tok, nil), 200)
	if s.Month != "2026-03" || s.DaysRemaining == nil || *s.DaysRemaining != 1 || *s.SafeToSpendPerDay != 310000 {
		t.Fatalf("local-date summary %+v", s)
	}
}
