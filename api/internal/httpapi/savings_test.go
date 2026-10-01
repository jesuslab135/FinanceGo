package httpapi_test

import (
	"fmt"
	"testing"
)

type savingsAccount struct {
	ID              int64    `json:"id"`
	Name            string   `json:"name"`
	Kind            string   `json:"kind"`
	OpeningBalance  int64    `json:"opening_balance"`
	ArchivedOn      *string  `json:"archived_on"`
	Balance         int64    `json:"balance"`
	PutIn           int64    `json:"put_in"`
	Gain            int64    `json:"gain"`
	GainPct         *float64 `json:"gain_pct"`
	EstimatedYield  *int64   `json:"estimated_yield"`
	AnchorDate      string   `json:"anchor_date"`
	Stale           bool     `json:"stale"`
	Insured         bool     `json:"insured"`
	HasHistory      bool     `json:"has_history"`
	HasMoneyHistory bool     `json:"has_money_history"`
}

type valuation struct {
	ValuedOn string `json:"valued_on"`
	Value    int64  `json:"value"`
}

func (h *harness) savingsAccount(tok, name, kind, institution string, opening int64, openingDate string) int64 {
	h.t.Helper()
	return expect[savingsAccount](h.t, h.do("POST", "/api/v1/savings-accounts", tok, M{
		"name": name, "kind": kind, "institution": institution, "opening_balance": opening, "opening_date": openingDate,
	}), 201).ID
}

func (h *harness) getAccount(tok string, id int64) savingsAccount {
	h.t.Helper()
	return expect[struct {
		Account savingsAccount `json:"account"`
	}](h.t, h.do("GET", fmt.Sprintf("/api/v1/savings-accounts/%d", id), tok, nil), 200).Account
}

func TestSavingsAccountsAndValuations(t *testing.T) {
	h := newHarness(t) // clock: 2026-03-15
	tok := h.signup("sav-acc@example.com")

	created := expect[savingsAccount](t, h.do("POST", "/api/v1/savings-accounts", tok, M{
		"name": "Cajita Japón", "kind": "bank", "institution": "Nu", "annual_rate_bp": 1300,
		"opening_balance": 100000, "opening_date": "2026-01-10",
	}), 201)
	if created.Balance != 100000 || created.PutIn != 100000 || !created.Insured || created.HasHistory || created.AnchorDate != "2026-01-10" {
		t.Fatalf("created %+v", created)
	}
	id := created.ID

	if r := h.do("POST", "/api/v1/savings-accounts", tok, M{"name": "Cajita Japón", "kind": "bank", "institution": "Nu", "opening_date": "2026-01-10"}); errCode(r) != "savings_account_exists" {
		t.Fatalf("duplicate name: %d %s", r.Code, r.Body)
	}
	for field, body := range map[string]M{
		"opening_date":   {"name": "A", "kind": "bank", "institution": "Nu", "opening_date": "2026-03-16"},
		"kind":           {"name": "B", "kind": "cash", "institution": "Nu", "opening_date": "2026-03-01"},
		"annual_rate_bp": {"name": "C", "kind": "bank", "institution": "Nu", "opening_date": "2026-03-01", "annual_rate_bp": 10001},
		"name":           {"name": "  ", "kind": "bank", "institution": "Nu", "opening_date": "2026-03-01"},
		"institution":    {"name": "D", "kind": "bank", "institution": "", "opening_date": "2026-03-01"},
	} {
		if r := h.do("POST", "/api/v1/savings-accounts", tok, body); r.Code != 422 || errFields(r)[field] == "" {
			t.Errorf("%s: %d %s", field, r.Code, r.Body)
		}
	}

	// The opening can change while there is no money history.
	put := M{"name": "Cajita Japón", "kind": "bank", "institution": "Nu", "opening_balance": 90000, "opening_date": "2026-01-10"}
	if a := expect[savingsAccount](t, h.do("PUT", fmt.Sprintf("/api/v1/savings-accounts/%d", id), tok, put), 200); a.Balance != 90000 {
		t.Fatalf("opening edit %+v", a)
	}

	vurl := fmt.Sprintf("/api/v1/savings-accounts/%d/valuations/", id)
	expect[valuation](t, h.do("PUT", vurl+"2026-03-01", tok, M{"value": 104000}), 200)
	expect[valuation](t, h.do("PUT", vurl+"2026-03-01", tok, M{"value": 99000}), 200) // same day: replaces
	a := h.getAccount(tok, id)
	if a.Balance != 99000 || a.Gain != 9000 || a.GainPct == nil || *a.GainPct != 10 || a.AnchorDate != "2026-03-01" || !a.HasMoneyHistory {
		t.Fatalf("after valuation %+v", a)
	}
	if vs := expect[M](t, h.do("GET", fmt.Sprintf("/api/v1/savings-accounts/%d/valuations", id), tok, nil), 200)["items"].([]any); len(vs) != 1 {
		t.Fatalf("valuations %v", vs)
	}
	if r := h.do("PUT", vurl+"2026-03-16", tok, M{"value": 1}); r.Code != 422 || errFields(r)["valued_on"] == "" {
		t.Fatalf("future valuation %d %s", r.Code, r.Body)
	}
	if r := h.do("PUT", vurl+"2026-01-09", tok, M{"value": 1}); r.Code != 422 || errFields(r)["valued_on"] == "" {
		t.Fatalf("valuation before opening %d %s", r.Code, r.Body)
	}
	if r := h.do("PUT", vurl+"2026-13-01", tok, M{"value": 1}); r.Code != 400 {
		t.Fatalf("bad date %d", r.Code)
	}

	put["opening_balance"] = 1
	if r := h.do("PUT", fmt.Sprintf("/api/v1/savings-accounts/%d", id), tok, put); r.Code != 422 || errFields(r)["opening_balance"] == "" {
		t.Fatalf("opening locked %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/savings-accounts/%d", id), tok, nil); errCode(r) != "account_has_history" {
		t.Fatalf("delete with history %d %s", r.Code, r.Body)
	}

	put["opening_balance"], put["archived"] = 90000, true
	if a := expect[savingsAccount](t, h.do("PUT", fmt.Sprintf("/api/v1/savings-accounts/%d", id), tok, put), 200); a.ArchivedOn == nil || *a.ArchivedOn != "2026-03-15" {
		t.Fatalf("archive %+v", a)
	}
	list := func(q string) []savingsAccount {
		return expect[struct {
			Items []savingsAccount `json:"items"`
		}](t, h.do("GET", "/api/v1/savings-accounts"+q, tok, nil), 200).Items
	}
	if l := list(""); len(l) != 0 {
		t.Fatalf("archived account listed by default: %+v", l)
	}
	if l := list("?include_archived=true"); len(l) != 1 {
		t.Fatalf("include_archived: %+v", l)
	}

	if r := h.do("DELETE", vurl+"2026-03-01", tok, nil); r.Code != 204 {
		t.Fatalf("delete valuation %d", r.Code)
	}
	if r := h.do("DELETE", vurl+"2026-03-01", tok, nil); r.Code != 404 {
		t.Fatalf("delete valuation twice %d", r.Code)
	}
	empty := h.savingsAccount(tok, "Vacía", "other", "Efectivo", 0, "2026-03-01")
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/savings-accounts/%d", empty), tok, nil); r.Code != 204 {
		t.Fatalf("delete empty account %d %s", r.Code, r.Body)
	}
	if r := h.do("GET", "/api/v1/savings-accounts/999999", tok, nil); r.Code != 404 {
		t.Fatalf("missing account %d", r.Code)
	}
}
