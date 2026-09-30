package httpapi_test

import (
	"fmt"
	"sync"
	"testing"
)

type entry struct {
	ID              int64   `json:"id"`
	Month           string  `json:"month"`
	Kind            string  `json:"kind"`
	Name            string  `json:"name"`
	Amount          int64   `json:"amount"`
	DueDate         string  `json:"due_date"`
	Status          string  `json:"status"`
	SettledOn       *string `json:"settled_on"`
	PaymentMethodID *int64  `json:"payment_method_id"`
	InstallmentNo   *int32  `json:"installment_no"`
	Edited          bool    `json:"edited"`
}

func (h *harness) entries(tok, month string) []entry {
	h.t.Helper()
	return expect[list[entry]](h.t, h.do("GET", "/api/v1/months/"+month+"/entries", tok, nil), 200).Items
}

func byKind(es []entry, kind string) []entry {
	var out []entry
	for _, e := range es {
		if e.Kind == kind {
			out = append(out, e)
		}
	}
	return out
}

func TestEnsureMonthGeneratesFromTemplates(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("gen@example.com")
	h.income(tok, 2000000, 15, "2026-01")
	h.fixed(tok, "Renta", 1000000, 1, "2026-03", nil)

	mar := h.entries(tok, "2026-03")
	if len(mar) != 2 || mar[0].Kind != "income" || mar[0].DueDate != "2026-03-15" || mar[1].DueDate != "2026-03-01" || mar[1].Status != "pending" {
		t.Fatalf("march %+v", mar)
	}
	if feb := h.entries(tok, "2026-02"); len(feb) != 1 || feb[0].Kind != "income" {
		t.Fatalf("feb %+v", feb)
	}
	if again := h.entries(tok, "2026-03"); len(again) != 2 {
		t.Fatalf("not idempotent: %d", len(again))
	}
	if r := h.do("GET", "/api/v1/months/2026-3/entries", tok, nil); r.Code != 400 {
		t.Fatalf("bad month: %d", r.Code)
	}
}

func TestEnsureMonthClampsDay31(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("clamp@example.com")
	h.fixed(tok, "Seguro", 50000, 31, "2026-01", nil)
	for month, want := range map[string]string{"2026-02": "2026-02-28", "2026-04": "2026-04-30", "2026-05": "2026-05-31", "2027-03": "2027-03-31"} {
		es := h.entries(tok, month)
		if len(es) != 1 || es[0].DueDate != want {
			t.Errorf("%s: %+v, want due %s", month, es, want)
		}
	}
	if r := h.do("GET", "/api/v1/months/2027-04/entries", tok, nil); r.Code != 422 || errCode(r) != "month_out_of_range" {
		t.Fatalf("13 months ahead: %d %s", r.Code, r.Body)
	}
}

func TestEnsureMonthConcurrent(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("race@example.com")
	h.income(tok, 2000000, 15, "2026-01")
	h.fixed(tok, "Renta", 1000000, 1, "2026-01", nil)
	var wg sync.WaitGroup
	codes := make([]int, 12)
	for i := range codes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes[i] = h.do("GET", "/api/v1/months/2026-06/entries", tok, nil).Code
		}(i)
	}
	wg.Wait()
	for i, c := range codes {
		if c != 200 {
			t.Fatalf("request %d: status %d", i, c)
		}
	}
	if n := len(h.entries(tok, "2026-06")); n != 2 {
		t.Fatalf("rows = %d, want 2", n)
	}
}

func TestUpdateEntry(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("upd@example.com")
	cc := h.creditCard(tok)
	h.income(tok, 2000000, 15, "2026-01")
	h.fixed(tok, "Renta", 1000000, 1, "2026-01", nil)
	es := h.entries(tok, "2026-03")
	inc, rent := byKind(es, "income")[0], byKind(es, "fixed")[0]

	paid := expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", rent.ID), tok, M{"amount": 1000000, "status": "paid"}), 200)
	if paid.SettledOn == nil || *paid.SettledOn != "2026-03-15" || paid.Edited {
		t.Fatalf("paid %+v", paid)
	}
	if r := h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", rent.ID), tok, M{"amount": 1000000, "status": "received"}); r.Code != 422 {
		t.Fatalf("received on fixed: %d", r.Code)
	}
	moved := expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", rent.ID), tok, M{"amount": 1100000, "status": "pending", "payment_method_id": cc}), 200)
	if !moved.Edited || moved.SettledOn != nil || *moved.PaymentMethodID != cc {
		t.Fatalf("moved %+v", moved)
	}
	got := expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", inc.ID), tok, M{"amount": 2000000, "status": "received", "settled_on": "2026-03-14"}), 200)
	if *got.SettledOn != "2026-03-14" {
		t.Fatalf("income %+v", got)
	}
	if r := h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", inc.ID), tok, M{"amount": 2000000, "status": "received", "payment_method_id": cc}); r.Code != 422 {
		t.Fatalf("pm on income: %d", r.Code)
	}
	other := h.signup("upd2@example.com")
	if r := h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", rent.ID), other, M{"amount": 1, "status": "paid"}); r.Code != 404 {
		t.Fatalf("foreign entry: %d", r.Code)
	}
}

func TestTemplateEditPropagation(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("prop@example.com")
	id := h.fixed(tok, "Renta", 1000000, 1, "2026-01", nil)
	for _, m := range []string{"2026-02", "2026-03", "2026-04", "2026-05", "2026-06"} {
		h.entries(tok, m)
	}
	may := byKind(h.entries(tok, "2026-05"), "fixed")[0]
	expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", may.ID), tok, M{"amount": 1200000, "status": "pending"}), 200)

	body := M{"name": "Renta depa", "amount": 1500000, "day_of_month": 5, "start_month": "2026-01", "category_id": h.catID(tok, "Vivienda")}
	expect[fixedPayment](t, h.do("PUT", fmt.Sprintf("/api/v1/fixed-payments/%d", id), tok, body), 200)

	check := func(month string, amount int64, due string) {
		t.Helper()
		e := byKind(h.entries(tok, month), "fixed")
		if len(e) != 1 || e[0].Amount != amount || e[0].DueDate != due {
			t.Errorf("%s: %+v, want %d due %s", month, e, amount, due)
		}
	}
	check("2026-02", 1000000, "2026-02-01") // past: frozen
	check("2026-03", 1500000, "2026-03-05") // current pending: follows
	check("2026-04", 1500000, "2026-04-05")
	check("2026-05", 1200000, "2026-05-01") // edited: kept

	body["end_month"] = "2026-04"
	expect[fixedPayment](t, h.do("PUT", fmt.Sprintf("/api/v1/fixed-payments/%d", id), tok, body), 200)
	if e := byKind(h.entries(tok, "2026-06"), "fixed"); len(e) != 0 {
		t.Fatalf("june not pruned: %+v", e)
	}
	check("2026-05", 1200000, "2026-05-01") // edited rows survive end_month

	expect[fixedPayment](t, h.do("DELETE", fmt.Sprintf("/api/v1/fixed-payments/%d", id), tok, nil), 200)
	check("2026-03", 1500000, "2026-03-05") // current month row stays after deactivation
	if e := byKind(h.entries(tok, "2026-04"), "fixed"); len(e) != 0 {
		t.Fatalf("april not pruned after deactivate: %+v", e)
	}
}
