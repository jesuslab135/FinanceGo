package httpapi_test

import (
	"fmt"
	"net/url"
	"testing"
)

type expense struct {
	ID              int64  `json:"id"`
	CategoryID      int64  `json:"category_id"`
	PaymentMethodID *int64 `json:"payment_method_id"`
	Amount          int64  `json:"amount"`
	Description     string `json:"description"`
	SpentOn         string `json:"spent_on"`
}

type expensePage struct {
	Items      []expense `json:"items"`
	NextCursor *string   `json:"next_cursor"`
}

func (h *harness) expense(tok, cat string, amount int64, on, desc string, pm *int64) int64 {
	h.t.Helper()
	return expect[expense](h.t, h.do("POST", "/api/v1/expenses", tok, M{
		"category_id": h.catID(tok, cat), "amount": amount, "spent_on": on, "description": desc, "payment_method_id": pm,
	}), 201).ID
}

func TestExpensesCRUDAndFilters(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("exp@example.com")
	cc := h.creditCard(tok)
	h.expense(tok, "Comida", 15000, "2026-03-01", "Tacos", nil)
	h.expense(tok, "Comida", 25000, "2026-03-02", "Súper 100% orgánico", &cc)
	id := h.expense(tok, "Transporte", 5000, "2026-03-02", "Uber", &cc)
	h.expense(tok, "Salud", 90000, "2026-02-20", "Dentista", nil)
	h.expense(tok, "Comida", 12000, "2026-03-10", "tacos al pastor", nil)

	page := func(q string) expensePage {
		t.Helper()
		return expect[expensePage](t, h.do("GET", "/api/v1/expenses?"+q, tok, nil), 200)
	}
	if p := page("from=2026-03-01&to=2026-03-31"); len(p.Items) != 4 || p.Items[0].SpentOn != "2026-03-10" {
		t.Fatalf("march %+v", p.Items)
	}
	if p := page(fmt.Sprintf("payment_method_id=%d", cc)); len(p.Items) != 2 {
		t.Fatalf("by card %d", len(p.Items))
	}
	if p := page("q=TACOS"); len(p.Items) != 2 {
		t.Fatalf("search %d", len(p.Items))
	}
	if p := page("q=" + url.QueryEscape("100%")); len(p.Items) != 1 {
		t.Fatalf("literal percent %d", len(p.Items))
	}

	var seen []int64
	cursor := ""
	for i := 0; i < 5; i++ {
		p := page("limit=2" + cursor)
		for _, e := range p.Items {
			seen = append(seen, e.ID)
		}
		if p.NextCursor == nil {
			break
		}
		cursor = "&cursor=" + url.QueryEscape(*p.NextCursor)
	}
	if len(seen) != 5 {
		t.Fatalf("paging saw %d, want 5 (%v)", len(seen), seen)
	}
	if r := h.do("GET", "/api/v1/expenses?cursor=bm9wZQ", tok, nil); r.Code != 400 {
		t.Fatalf("bad cursor: %d", r.Code)
	}

	up := expect[expense](t, h.do("PUT", fmt.Sprintf("/api/v1/expenses/%d", id), tok, M{
		"category_id": h.catID(tok, "Transporte"), "amount": 7000, "spent_on": "2026-03-03", "description": "Uber", "payment_method_id": nil,
	}), 200)
	if up.Amount != 7000 || up.PaymentMethodID != nil {
		t.Fatalf("update %+v", up)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/expenses/%d", id), tok, nil); r.Code != 204 {
		t.Fatalf("delete %d", r.Code)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/expenses/%d", id), tok, nil); r.Code != 404 {
		t.Fatalf("delete twice %d", r.Code)
	}
}

func TestExpenseValidation(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("expv@example.com")
	bad := []M{
		{"category_id": h.catID(tok, "Comida"), "amount": 0, "spent_on": "2026-03-01"},
		{"category_id": h.catID(tok, "Comida"), "amount": 100},
		{"category_id": h.catID(tok, "Salario"), "amount": 100, "spent_on": "2026-03-01"},
	}
	for i, b := range bad {
		if r := h.do("POST", "/api/v1/expenses", tok, b); r.Code != 422 {
			t.Errorf("bad[%d]: %d %s", i, r.Code, r.Body)
		}
	}
}

func TestExpenseRejectsForeignReferences(t *testing.T) {
	h := newHarness(t)
	a := h.signup("owner@example.com")
	b := h.signup("intruder@example.com")
	aCard := h.creditCard(a)
	aFood := h.catID(a, "Comida")

	r := h.do("POST", "/api/v1/expenses", b, M{"category_id": aFood, "amount": 100, "spent_on": "2026-03-01"})
	if r.Code != 422 || errCode(r) != "invalid_reference" || errFields(r)["category_id"] == "" {
		t.Fatalf("foreign category: %d %s", r.Code, r.Body)
	}
	r = h.do("POST", "/api/v1/expenses", b, M{"category_id": h.catID(b, "Comida"), "amount": 100, "spent_on": "2026-03-01", "payment_method_id": aCard})
	if r.Code != 422 || errCode(r) != "invalid_reference" || errFields(r)["payment_method_id"] == "" {
		t.Fatalf("foreign card: %d %s", r.Code, r.Body)
	}
	id := h.expense(a, "Comida", 100, "2026-03-01", "", nil)
	if r := h.do("PUT", fmt.Sprintf("/api/v1/expenses/%d", id), b, M{"category_id": h.catID(b, "Comida"), "amount": 1, "spent_on": "2026-03-01"}); r.Code != 404 {
		t.Fatalf("foreign update: %d", r.Code)
	}
}
