package httpapi_test

import (
	"fmt"
	"testing"
)

type incomeSource struct {
	ID         int64   `json:"id"`
	CategoryID *int64  `json:"category_id"`
	Name       string  `json:"name"`
	Amount     int64   `json:"amount"`
	Frequency  string  `json:"frequency"`
	DayOfMonth int32   `json:"day_of_month"`
	SecondDay  *int32  `json:"second_day"`
	AnchorDate *string `json:"anchor_date"`
	StartMonth string  `json:"start_month"`
	EndMonth   *string `json:"end_month"`
	Active     bool    `json:"active"`
}

type fixedPayment struct {
	ID              int64   `json:"id"`
	CategoryID      int64   `json:"category_id"`
	PaymentMethodID *int64  `json:"payment_method_id"`
	Name            string  `json:"name"`
	Amount          int64   `json:"amount"`
	DayOfMonth      int32   `json:"day_of_month"`
	StartMonth      string  `json:"start_month"`
	EndMonth        *string `json:"end_month"`
	Active          bool    `json:"active"`
}

func (h *harness) income(tok string, amount int64, day int, start string) int64 {
	h.t.Helper()
	return expect[incomeSource](h.t, h.do("POST", "/api/v1/income-sources", tok, M{
		"name": "Salario", "amount": amount, "day_of_month": day, "start_month": start, "category_id": h.catID(tok, "Salario"),
	}), 201).ID
}

func (h *harness) fixed(tok, name string, amount int64, day int, start string, pm *int64) int64 {
	h.t.Helper()
	return expect[fixedPayment](h.t, h.do("POST", "/api/v1/fixed-payments", tok, M{
		"name": name, "amount": amount, "day_of_month": day, "start_month": start,
		"category_id": h.catID(tok, "Vivienda"), "payment_method_id": pm,
	}), 201).ID
}

func TestIncomeSources(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("inc@example.com")
	id := h.income(tok, 2500000, 15, "2026-01")

	l := expect[list[incomeSource]](t, h.do("GET", "/api/v1/income-sources", tok, nil), 200)
	if len(l.Items) != 1 || l.Items[0].StartMonth != "2026-01" || !l.Items[0].Active {
		t.Fatalf("list %+v", l.Items)
	}
	up := expect[incomeSource](t, h.do("PUT", fmt.Sprintf("/api/v1/income-sources/%d", id), tok, M{
		"name": "Salario", "amount": 2600000, "day_of_month": 30, "start_month": "2026-01", "end_month": "2026-12",
	}), 200)
	if up.Amount != 2600000 || up.EndMonth == nil || *up.EndMonth != "2026-12" || up.CategoryID != nil {
		t.Fatalf("update %+v", up)
	}
	off := expect[incomeSource](t, h.do("DELETE", fmt.Sprintf("/api/v1/income-sources/%d", id), tok, nil), 200)
	if off.Active {
		t.Fatal("not deactivated")
	}

	bad := []M{
		{"name": "x", "amount": 0, "day_of_month": 1, "start_month": "2026-01"},
		{"name": "x", "amount": 1, "day_of_month": 32, "start_month": "2026-01"},
		{"name": "x", "amount": 1, "day_of_month": 1},
		{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-05", "end_month": "2026-04"},
		{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": h.catID(tok, "Comida")},
	}
	for i, b := range bad {
		if r := h.do("POST", "/api/v1/income-sources", tok, b); r.Code != 422 {
			t.Errorf("bad[%d]: %d %s", i, r.Code, r.Body)
		}
	}
	if r := h.do("POST", "/api/v1/income-sources", tok, M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-1"}); r.Code != 400 {
		t.Errorf("malformed month: %d", r.Code)
	}
}

func TestFixedPayments(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("fix@example.com")
	cc := h.creditCard(tok)
	id := h.fixed(tok, "Renta", 1000000, 1, "2026-01", &cc)

	l := expect[list[fixedPayment]](t, h.do("GET", "/api/v1/fixed-payments", tok, nil), 200)
	if len(l.Items) != 1 || *l.Items[0].PaymentMethodID != cc {
		t.Fatalf("list %+v", l.Items)
	}
	if r := h.do("POST", "/api/v1/fixed-payments", tok, M{
		"name": "Luz", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": h.catID(tok, "Salario"),
	}); r.Code != 422 {
		t.Fatalf("income category accepted: %d", r.Code)
	}
	other := newHarnessUserOn(h, "other-fix@example.com")
	if r := h.do("POST", "/api/v1/fixed-payments", other, M{
		"name": "Luz", "amount": 1, "day_of_month": 1, "start_month": "2026-01",
		"category_id": h.catID(other, "Vivienda"), "payment_method_id": cc,
	}); r.Code != 422 || errCode(r) != "invalid_reference" {
		t.Fatalf("foreign card: %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/fixed-payments/%d", id), other, nil); r.Code != 404 {
		t.Fatalf("foreign deactivate: %d", r.Code)
	}
}

// newHarnessUserOn signs up a second user on the same harness and returns its token.
func newHarnessUserOn(h *harness, email string) string { return h.signup(email) }

// Deactivating a template ends it at the current month: months up to then
// (even never-loaded, backdated ones) still show it, later months don't.
func TestDeactivateKeepsPastMonths(t *testing.T) {
	h := newHarness(t) // today 2026-03-15
	tok := h.signup("deact@example.com")
	id := h.income(tok, 2500000, 15, "2026-01")
	off := expect[incomeSource](t, h.do("DELETE", fmt.Sprintf("/api/v1/income-sources/%d", id), tok, nil), 200)
	if off.Active || off.EndMonth == nil || *off.EndMonth != "2026-03" {
		t.Fatalf("deactivated %+v", off)
	}
	for _, m := range []string{"2026-02", "2026-03"} {
		if got := byKind(h.entries(tok, m), "income"); len(got) != 1 {
			t.Fatalf("%s: income rows %+v", m, got)
		}
	}
	if got := byKind(h.entries(tok, "2026-04"), "income"); len(got) != 0 {
		t.Fatalf("2026-04 after deactivation: %+v", got)
	}

	// PUT active=false clamps an explicit later end_month the same way.
	fid := h.fixed(tok, "Renta", 1000000, 1, "2026-01", nil)
	h.entries(tok, "2026-05") // materialize a future month first; it gets pruned
	put := expect[fixedPayment](t, h.do("PUT", fmt.Sprintf("/api/v1/fixed-payments/%d", fid), tok, M{
		"name": "Renta", "amount": 1000000, "day_of_month": 1, "start_month": "2026-01", "end_month": "2026-12",
		"category_id": h.catID(tok, "Vivienda"), "active": false,
	}), 200)
	if put.Active || put.EndMonth == nil || *put.EndMonth != "2026-03" {
		t.Fatalf("PUT active=false %+v", put)
	}
	if len(byKind(h.entries(tok, "2026-01"), "fixed")) != 1 || len(byKind(h.entries(tok, "2026-05"), "fixed")) != 0 {
		t.Fatal("fixed deactivation range wrong")
	}

	// A template that has not started yet generates nothing once deactivated.
	future := expect[incomeSource](t, h.do("POST", "/api/v1/income-sources", tok, M{
		"name": "Bono", "amount": 100, "day_of_month": 1, "start_month": "2026-06", "end_month": "2026-08",
	}), 201).ID
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/income-sources/%d", future), tok, nil); r.Code != 200 {
		t.Fatalf("deactivate future: %d %s", r.Code, r.Body)
	}
	for _, e := range byKind(h.entries(tok, "2026-06"), "income") {
		if e.Name == "Bono" {
			t.Fatalf("deactivated future template generated %+v", e)
		}
	}
}

func dueDates(es []entry) string {
	s := ""
	for _, e := range byKind(es, "income") {
		s += e.DueDate[8:] + " "
	}
	return s
}

func incomeTotal(es []entry) (sum int64) {
	for _, e := range byKind(es, "income") {
		sum += e.Amount
	}
	return sum
}

// Every pay date of a schedule becomes its own row, each for the per-payment amount.
func TestIncomePaySchedules(t *testing.T) {
	h := newHarness(t) // today 2026-03-15
	tok := h.signup("sched@example.com")
	post := func(body M) incomeSource {
		body["name"], body["amount"], body["start_month"] = "Pago", 500000, "2026-01"
		return expect[incomeSource](t, h.do("POST", "/api/v1/income-sources", tok, body), 201)
	}

	// 2026-03-06 is a Friday.
	weekly := post(M{"frequency": "weekly", "anchor_date": "2026-03-06"})
	if weekly.Frequency != "weekly" || weekly.AnchorDate == nil || *weekly.AnchorDate != "2026-03-06" {
		t.Fatalf("weekly %+v", weekly)
	}
	if got := dueDates(h.entries(tok, "2026-03")); got != "06 13 20 27 " {
		t.Fatalf("weekly march: %s", got)
	}
	if es := h.entries(tok, "2026-05"); dueDates(es) != "01 08 15 22 29 " || incomeTotal(es) != 5*500000 {
		t.Fatalf("weekly may: %+v", es)
	}
	if got := dueDates(h.entries(tok, "2026-03")); got != "06 13 20 27 " {
		t.Fatalf("not idempotent: %s", got)
	}
	h.do("DELETE", fmt.Sprintf("/api/v1/income-sources/%d", weekly.ID), tok, nil)

	tok = h.signup("sched2@example.com")
	post(M{"frequency": "biweekly", "anchor_date": "2026-03-06"})
	if got := dueDates(h.entries(tok, "2026-03")) + dueDates(h.entries(tok, "2026-04")) + dueDates(h.entries(tok, "2026-02")); got != "06 20 03 17 06 20 " {
		t.Fatalf("biweekly: %s", got)
	}

	tok = h.signup("sched3@example.com")
	semi := post(M{"frequency": "semimonthly", "day_of_month": 30, "second_day": 15})
	if semi.DayOfMonth != 15 || semi.SecondDay == nil || *semi.SecondDay != 30 {
		t.Fatalf("semimonthly days are stored in order: %+v", semi)
	}
	if got := dueDates(h.entries(tok, "2026-03")) + dueDates(h.entries(tok, "2026-02")); got != "15 30 15 28 " {
		t.Fatalf("semimonthly: %s", got)
	}
	// The dashboard counts both payments.
	if s := expect[struct {
		Income int64 `json:"income"`
	}](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-03", tok, nil), 200); s.Income != 1000000 {
		t.Fatalf("summary income %d", s.Income)
	}

	// No frequency means monthly, and unused schedule fields are dropped.
	tok = h.signup("sched4@example.com")
	monthly := post(M{"day_of_month": 10, "second_day": 20, "anchor_date": "2026-03-06"})
	if monthly.Frequency != "monthly" || monthly.SecondDay != nil || monthly.AnchorDate != nil {
		t.Fatalf("monthly %+v", monthly)
	}

	for i, b := range []M{
		{"frequency": "daily", "day_of_month": 1},
		{"frequency": "weekly"},
		{"frequency": "biweekly", "day_of_month": 5},
		{"frequency": "semimonthly", "day_of_month": 15},
		{"frequency": "semimonthly", "day_of_month": 15, "second_day": 15},
		{"frequency": "semimonthly", "day_of_month": 15, "second_day": 32},
	} {
		b["name"], b["amount"], b["start_month"] = "x", 1, "2026-01"
		if r := h.do("POST", "/api/v1/income-sources", tok, b); r.Code != 422 {
			t.Errorf("bad[%d]: %d %s", i, r.Code, r.Body)
		}
	}
}

// Changing how often a source pays rewrites pending rows from the current month
// on, keeps settled ones, and never adds income to days that already passed.
func TestIncomeScheduleChange(t *testing.T) {
	h := newHarness(t) // today 2026-03-15
	tok := h.signup("resched@example.com")
	id := h.income(tok, 2000000, 1, "2026-01")
	mar := h.entries(tok, "2026-03")
	h.entries(tok, "2026-02")
	h.entries(tok, "2026-04")
	if r := h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", byKind(mar, "income")[0].ID), tok, M{"amount": 2000000, "status": "received"}); r.Code != 200 {
		t.Fatalf("receive: %d %s", r.Code, r.Body)
	}
	put := func(body M) {
		t.Helper()
		body["name"], body["start_month"] = "Salario", "2026-01"
		if r := h.do("PUT", fmt.Sprintf("/api/v1/income-sources/%d", id), tok, body); r.Code != 200 {
			t.Fatalf("put: %d %s", r.Code, r.Body)
		}
	}

	put(M{"amount": 500000, "frequency": "weekly", "anchor_date": "2026-03-06"})
	// March keeps the received salary and gains only the Fridays still ahead (20, 27).
	mar = h.entries(tok, "2026-03")
	if dueDates(mar) != "01 20 27 " || incomeTotal(mar) != 2000000+2*500000 {
		t.Fatalf("march after weekly: %+v", byKind(mar, "income"))
	}
	if feb := h.entries(tok, "2026-02"); dueDates(feb) != "01 " || incomeTotal(feb) != 2000000 {
		t.Fatalf("a past month changed: %+v", byKind(feb, "income"))
	}
	if apr := h.entries(tok, "2026-04"); dueDates(apr) != "03 10 17 24 " || incomeTotal(apr) != 4*500000 {
		t.Fatalf("april after weekly: %+v", byKind(apr, "income"))
	}

	// Back to monthly: the extra pending rows go, the first one takes the new day.
	put(M{"amount": 2100000, "frequency": "monthly", "day_of_month": 25})
	if apr := h.entries(tok, "2026-04"); dueDates(apr) != "25 " || incomeTotal(apr) != 2100000 {
		t.Fatalf("april after monthly: %+v", byKind(apr, "income"))
	}
	if mar = h.entries(tok, "2026-03"); dueDates(mar) != "01 " || incomeTotal(mar) != 2000000 {
		t.Fatalf("march after monthly: %+v", byKind(mar, "income"))
	}
}
