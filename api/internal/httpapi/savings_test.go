package httpapi_test

import (
	"fmt"
	"testing"
	"time"
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

type savingsGoal struct {
	ID               int64   `json:"id"`
	AccountID        int64   `json:"account_id"`
	Status           string  `json:"status"`
	Progress         int64   `json:"progress"`
	Remaining        int64   `json:"remaining"`
	Pct              int32   `json:"pct"`
	RequiredMonthly  *int64  `json:"required_monthly"`
	BehindBy         *int64  `json:"behind_by"`
	PlannedThisMonth int64   `json:"planned_this_month"`
	StartMonth       string  `json:"start_month"`
	AchievedOn       *string `json:"achieved_on"`
	Archived         bool    `json:"archived"`
}

func (h *harness) savingsGoal(tok string, body M) savingsGoal {
	h.t.Helper()
	return expect[savingsGoal](h.t, h.do("POST", "/api/v1/savings-goals", tok, body), 201)
}

func (h *harness) goals(tok, q string) []savingsGoal {
	h.t.Helper()
	return expect[struct {
		Items []savingsGoal `json:"items"`
	}](h.t, h.do("GET", "/api/v1/savings-goals"+q, tok, nil), 200).Items
}

func TestSavingsGoals(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("sav-goal@example.com")
	acc := h.savingsAccount(tok, "Cajita", "bank", "Nu", 0, "2026-03-01")

	g := h.savingsGoal(tok, M{"account_id": acc, "name": "Viaje Japón", "target_amount": 12_000_000, "target_date": "2026-12-31"})
	if g.Status != "on_track" || g.RequiredMonthly == nil || *g.RequiredMonthly != 1_200_000 ||
		g.PlannedThisMonth != 1_200_000 || g.StartMonth != "2026-03" || g.Remaining != 12_000_000 {
		t.Fatalf("created %+v", g)
	}

	bad := []struct {
		field string
		body  M
	}{
		{"target_date", M{"account_id": acc, "name": "x", "target_amount": 100, "target_date": "2026-02-28"}},
		{"emergency_months", M{"account_id": acc, "name": "x", "target_amount": 100, "kind": "emergency"}},
		{"emergency_months", M{"account_id": acc, "name": "x", "target_amount": 100, "kind": "emergency", "emergency_months": 4}},
		{"emergency_months", M{"account_id": acc, "name": "x", "target_amount": 100, "emergency_months": 3}},
		{"target_amount", M{"account_id": acc, "name": "x", "target_amount": 0}},
		{"monthly_amount", M{"account_id": acc, "name": "x", "target_amount": 100, "monthly_amount": 0}},
		{"name", M{"account_id": acc, "name": "", "target_amount": 100}},
	}
	for _, c := range bad {
		if r := h.do("POST", "/api/v1/savings-goals", tok, c.body); r.Code != 422 || errFields(r)[c.field] == "" {
			t.Errorf("%s: %d %s", c.field, r.Code, r.Body)
		}
	}
	if r := h.do("POST", "/api/v1/savings-goals", tok, M{"account_id": 999999, "name": "x", "target_amount": 100}); errCode(r) != "invalid_reference" {
		t.Fatalf("missing account %d %s", r.Code, r.Body)
	}

	archived := h.savingsAccount(tok, "Vieja", "bank", "BBVA", 0, "2026-03-01")
	expect[savingsAccount](t, h.do("PUT", fmt.Sprintf("/api/v1/savings-accounts/%d", archived), tok,
		M{"name": "Vieja", "kind": "bank", "institution": "BBVA", "opening_date": "2026-03-01", "archived": true}), 200)
	if r := h.do("POST", "/api/v1/savings-goals", tok, M{"account_id": archived, "name": "x", "target_amount": 100}); r.Code != 422 || errFields(r)["account_id"] == "" {
		t.Fatalf("archived account %d %s", r.Code, r.Body)
	}

	gurl := fmt.Sprintf("/api/v1/savings-goals/%d", g.ID)
	upd := M{"account_id": acc, "name": "Viaje Japón", "target_amount": 12_000_000, "target_date": "2026-12-31", "monthly_amount": 500_000}
	if got := expect[savingsGoal](t, h.do("PUT", gurl, tok, upd), 200); got.PlannedThisMonth != 500_000 {
		t.Fatalf("monthly amount drives the plan: %+v", got)
	}
	other := h.savingsAccount(tok, "Otra", "bank", "Nu", 0, "2026-03-01")
	upd["account_id"] = other
	if r := h.do("PUT", gurl, tok, upd); r.Code != 422 || errFields(r)["account_id"] == "" {
		t.Fatalf("account change %d %s", r.Code, r.Body)
	}
	upd["account_id"], upd["archived"] = acc, true
	expect[savingsGoal](t, h.do("PUT", gurl, tok, upd), 200)
	if l := h.goals(tok, ""); len(l) != 0 {
		t.Fatalf("archived goal listed: %+v", l)
	}
	if l := h.goals(tok, "?include_archived=true"); len(l) != 1 || !l[0].Archived {
		t.Fatalf("include_archived: %+v", l)
	}
	if r := h.do("DELETE", gurl, tok, nil); r.Code != 204 {
		t.Fatalf("delete %d", r.Code)
	}
	if r := h.do("DELETE", gurl, tok, nil); r.Code != 404 {
		t.Fatalf("delete twice %d", r.Code)
	}
}

func TestSavingsEmergencySuggestion(t *testing.T) {
	h := newHarness(t) // 2026-03-15: completed months are Dec, Jan, Feb
	tok := h.signup("sav-emergency@example.com")
	h.fixed(tok, "Renta", 1_000_000, 1, "2026-01", nil)
	h.expense(tok, "Comida", 200_000, "2026-02-10", "", nil)

	// Dec has no data and is skipped; Jan 1000000, Feb 1200000 → average 1100000.
	s := expect[M](t, h.do("GET", "/api/v1/savings-goals/emergency-suggestion?months=3", tok, nil), 200)
	if s["monthly_need"] != float64(1_100_000) || s["months"] != float64(3) || s["target"] != float64(3_300_000) {
		t.Fatalf("suggestion %v", s)
	}
	if s := expect[M](t, h.do("GET", "/api/v1/savings-goals/emergency-suggestion?months=6", tok, nil), 200); s["target"] != float64(6_600_000) {
		t.Fatalf("6 months %v", s)
	}
	if r := h.do("GET", "/api/v1/savings-goals/emergency-suggestion?months=4", tok, nil); r.Code != 422 {
		t.Fatalf("months=4 %d", r.Code)
	}

	// No completed month with data: fall back to the current month (an expense of 12345 → 37035 → rounded up to 40000).
	fresh := h.signup("sav-emergency-2@example.com")
	h.expense(fresh, "Comida", 12_345, "2026-03-02", "", nil)
	if s := expect[M](t, h.do("GET", "/api/v1/savings-goals/emergency-suggestion?months=3", fresh, nil), 200); s["monthly_need"] != float64(12_345) || s["target"] != float64(40_000) {
		t.Fatalf("fallback %v", s)
	}
}

func (h *harness) move(tok string, body M) int64 {
	h.t.Helper()
	return int64(expect[M](h.t, h.do("POST", "/api/v1/account-movements", tok, body), 201)["id"].(float64))
}

func (h *harness) goalByID(tok string, id int64) savingsGoal {
	h.t.Helper()
	for _, g := range h.goals(tok, "?include_archived=true") {
		if g.ID == id {
			return g
		}
	}
	h.t.Fatalf("goal %d not found", id)
	return savingsGoal{}
}

func TestSavingsMovementsAndGoalProgress(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("sav-move@example.com")
	a := h.savingsAccount(tok, "Cajita", "bank", "Nu", 0, "2026-03-01")
	b := h.savingsAccount(tok, "GBM", "broker", "GBM", 0, "2026-03-01")
	g := h.savingsGoal(tok, M{"account_id": a, "name": "Japón", "target_amount": 100_000, "monthly_amount": 20_000}).ID
	gb := h.savingsGoal(tok, M{"account_id": b, "name": "Retiro", "target_amount": 100_000}).ID

	h.move(tok, M{"account_id": a, "kind": "deposit", "goal_id": g, "amount": 60_000, "occurred_on": "2026-03-05"})
	if got := h.goalByID(tok, g); got.Progress != 60_000 || got.Pct != 60 || got.Status != "no_date" {
		t.Fatalf("after deposit %+v", got)
	}
	r := h.do("POST", "/api/v1/account-movements", tok, M{"account_id": a, "kind": "withdrawal", "amount": 60_001, "occurred_on": "2026-03-06"})
	if errCode(r) != "insufficient_balance" || errFields(r)["amount"] == "" {
		t.Fatalf("overdraw %d %s", r.Code, r.Body)
	}
	h.move(tok, M{"account_id": a, "kind": "withdrawal", "goal_id": g, "amount": 10_000, "occurred_on": "2026-03-06"})
	h.move(tok, M{"account_id": a, "kind": "transfer", "to_account_id": b, "amount": 20_000, "occurred_on": "2026-03-07"})
	if acc := h.getAccount(tok, a); acc.Balance != 30_000 || acc.PutIn != 30_000 {
		t.Fatalf("A %+v", acc)
	}
	if acc := h.getAccount(tok, b); acc.Balance != 20_000 || acc.PutIn != 20_000 {
		t.Fatalf("B %+v", acc)
	}

	bad := []struct {
		field, code string
		body        M
	}{
		{"goal_id", "", M{"account_id": a, "kind": "transfer", "to_account_id": b, "goal_id": g, "amount": 1, "occurred_on": "2026-03-07"}},
		{"to_account_id", "", M{"account_id": a, "kind": "transfer", "to_account_id": a, "amount": 1, "occurred_on": "2026-03-07"}},
		{"to_account_id", "", M{"account_id": a, "kind": "deposit", "to_account_id": b, "amount": 1, "occurred_on": "2026-03-07"}},
		{"to_account_id", "invalid_reference", M{"account_id": a, "kind": "transfer", "to_account_id": 999999, "amount": 1, "occurred_on": "2026-03-07"}},
		{"goal_id", "", M{"account_id": a, "kind": "deposit", "goal_id": gb, "amount": 1, "occurred_on": "2026-03-07"}},
		{"occurred_on", "", M{"account_id": a, "kind": "deposit", "amount": 1, "occurred_on": "2026-03-16"}},
		{"occurred_on", "", M{"account_id": a, "kind": "deposit", "amount": 1, "occurred_on": "2026-02-28"}},
		{"kind", "", M{"account_id": a, "kind": "interest", "amount": 1, "occurred_on": "2026-03-07"}},
		{"amount", "", M{"account_id": a, "kind": "deposit", "amount": 0, "occurred_on": "2026-03-07"}},
		{"account_id", "invalid_reference", M{"account_id": 999999, "kind": "deposit", "amount": 1, "occurred_on": "2026-03-07"}},
	}
	for i, c := range bad {
		r := h.do("POST", "/api/v1/account-movements", tok, c.body)
		if r.Code != 422 || errFields(r)[c.field] == "" || (c.code != "" && errCode(r) != c.code) {
			t.Errorf("case %d (%s): %d %s", i, c.field, r.Code, r.Body)
		}
	}

	// Reaching the target: progress 50000 + 70000 = 120000, capped by the balance (100000) = target → achieved today.
	dep := h.move(tok, M{"account_id": a, "kind": "deposit", "goal_id": g, "amount": 70_000, "occurred_on": "2026-03-10"})
	if got := h.goalByID(tok, g); got.Status != "achieved" || got.AchievedOn == nil || *got.AchievedOn != "2026-03-15" {
		t.Fatalf("achieved %+v", got)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/account-movements/%d", dep), tok, nil); r.Code != 204 {
		t.Fatalf("delete movement %d", r.Code)
	}
	if got := h.goalByID(tok, g); got.AchievedOn != nil {
		t.Fatalf("achieved_on must clear when the goal drops below: %+v", got)
	}

	list := expect[struct {
		Items []M `json:"items"`
	}](t, h.do("GET", fmt.Sprintf("/api/v1/savings-accounts/%d/movements", b), tok, nil), 200).Items
	if len(list) != 1 || list[0]["kind"] != "transfer" {
		t.Fatalf("B movements %v", list)
	}
	if l := expect[struct {
		Items []M `json:"items"`
	}](t, h.do("GET", fmt.Sprintf("/api/v1/savings-accounts/%d/movements?from=2026-03-06&to=2026-03-06", a), tok, nil), 200).Items; len(l) != 1 {
		t.Fatalf("date filter %v", l)
	}
}

func TestSavingsMovementEditBalanceAndResync(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("sav-edit@example.com")
	a := h.savingsAccount(tok, "A", "bank", "Nu", 60_000, "2026-03-01")
	b := h.savingsAccount(tok, "B", "bank", "Klar", 0, "2026-03-01")
	ga := h.savingsGoal(tok, M{"account_id": a, "name": "GA", "target_amount": 50_000}).ID
	gb := h.savingsGoal(tok, M{"account_id": b, "name": "GB", "target_amount": 10_000}).ID

	w := h.move(tok, M{"account_id": a, "kind": "withdrawal", "amount": 50_000, "occurred_on": "2026-03-02"})
	wurl := fmt.Sprintf("/api/v1/account-movements/%d", w)
	// Checked without its own old amount: the balance before it is 60000.
	expect[M](t, h.do("PUT", wurl, tok, M{"account_id": a, "kind": "withdrawal", "amount": 60_000, "occurred_on": "2026-03-02"}), 200)
	if r := h.do("PUT", wurl, tok, M{"account_id": a, "kind": "withdrawal", "amount": 60_001, "occurred_on": "2026-03-02"}); errCode(r) != "insufficient_balance" {
		t.Fatalf("edit overdraw %d %s", r.Code, r.Body)
	}

	d := h.move(tok, M{"account_id": a, "kind": "deposit", "goal_id": ga, "amount": 50_000, "occurred_on": "2026-03-03"})
	if got := h.goalByID(tok, ga); got.AchievedOn == nil {
		t.Fatalf("GA should be achieved: %+v", got)
	}
	// Move the deposit to B/GB: GA drops (cleared), GB reaches its target (set).
	expect[M](t, h.do("PUT", fmt.Sprintf("/api/v1/account-movements/%d", d), tok,
		M{"account_id": b, "kind": "deposit", "goal_id": gb, "amount": 50_000, "occurred_on": "2026-03-03"}), 200)
	if got := h.goalByID(tok, ga); got.AchievedOn != nil || got.Progress != 0 {
		t.Fatalf("GA after move %+v", got)
	}
	if got := h.goalByID(tok, gb); got.AchievedOn == nil {
		t.Fatalf("GB after move %+v", got)
	}
}

func TestSavingsMovementDatesUseUserTimezone(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("sav-tz@example.com")
	expect[M](t, h.do("PUT", "/api/v1/me", tok, M{"name": "Test User", "currency": "MXN", "locale": "es", "timezone": "America/Mexico_City"}), 200)
	a := h.savingsAccount(tok, "A", "bank", "Nu", 0, "2026-03-01")
	h.setNow(time.Date(2026, 3, 16, 3, 0, 0, 0, time.UTC)) // 21:00 on Mar 15 in Mexico City
	tok = h.login("sav-tz@example.com")
	h.move(tok, M{"account_id": a, "kind": "deposit", "amount": 100, "occurred_on": "2026-03-15"})
	if r := h.do("POST", "/api/v1/account-movements", tok, M{"account_id": a, "kind": "deposit", "amount": 100, "occurred_on": "2026-03-16"}); r.Code != 422 || errFields(r)["occurred_on"] == "" {
		t.Fatalf("Mar 16 is still the future in Mexico City: %d %s", r.Code, r.Body)
	}
}

type overview struct {
	NetWorth int64   `json:"net_worth"`
	Assets   int64   `json:"assets"`
	CardDebt int64   `json:"card_debt"`
	UDIValue float64 `json:"udi_value"`
	Month    struct {
		Planned int64 `json:"planned"`
		Saved   int64 `json:"saved"`
	} `json:"month"`
	Allocation []struct {
		Kind   string `json:"kind"`
		Amount int64  `json:"amount"`
		Pct    int32  `json:"pct"`
	} `json:"allocation"`
	InsuranceWarnings []struct {
		Institution string `json:"institution"`
		Total       int64  `json:"total"`
		Limit       int64  `json:"limit"`
		Excess      int64  `json:"excess"`
	} `json:"insurance_warnings"`
}

func TestSavingsOverviewAndNetWorth(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("sav-overview@example.com")
	h.savingsAccount(tok, "Klar 1", "sofipo", "Klar", 15_000_000, "2026-01-01")
	h.savingsAccount(tok, "Klar 2", "sofipo", " klar", 10_000_000, "2026-01-01")
	nu := h.savingsAccount(tok, "Nu", "bank", "Nu", 1_000_000, "2026-01-01")
	cetes := h.savingsAccount(tok, "CETES", "government", "CETES Directo", 500_000, "2026-01-01")
	expect[valuation](t, h.do("PUT", fmt.Sprintf("/api/v1/savings-accounts/%d/valuations/2026-03-01", cetes), tok, M{"value": 520_000}), 200)
	card := h.creditCard(tok)
	h.expense(tok, "Comida", 300_000, "2026-03-02", "", &card)
	h.savingsGoal(tok, M{"account_id": nu, "name": "Meta", "target_amount": 10_000_000, "monthly_amount": 100_000})

	var cardDebt int64
	for _, c := range expect[struct {
		Items []struct {
			CurrentBalance int64 `json:"current_balance"`
		} `json:"items"`
	}](t, h.do("GET", "/api/v1/dashboard/cards", tok, nil), 200).Items {
		cardDebt += c.CurrentBalance
	}

	o := expect[overview](t, h.do("GET", "/api/v1/savings/overview", tok, nil), 200)

	if o.Assets != 26_520_000 || o.CardDebt != cardDebt || cardDebt <= 0 || o.NetWorth != o.Assets-cardDebt || o.UDIValue != 8.70 {
		t.Fatalf("overview totals %+v (card debt %d)", o, cardDebt)
	}
	if o.Month.Planned != 100_000 || o.Month.Saved != 100_000 {
		t.Fatalf("month %+v", o.Month)
	}
	if len(o.InsuranceWarnings) != 1 || o.InsuranceWarnings[0].Institution != "Klar" || o.InsuranceWarnings[0].Excess != 3_250_000 {
		t.Fatalf("warnings %+v", o.InsuranceWarnings)
	}
	if len(o.Allocation) != 3 || o.Allocation[0].Kind != "sofipo" {
		t.Fatalf("allocation %+v", o.Allocation)
	}
}

func TestSavingsSeries(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("sav-series@example.com")
	a := h.savingsAccount(tok, "A", "bank", "Nu", 100_000, "2026-01-10")
	h.move(tok, M{"account_id": a, "kind": "deposit", "amount": 20_000, "occurred_on": "2026-02-05"})
	expect[valuation](t, h.do("PUT", fmt.Sprintf("/api/v1/savings-accounts/%d/valuations/2026-02-28", a), tok, M{"value": 130_000}), 200)
	h.savingsAccount(tok, "Later", "bank", "BBVA", 50_000, "2026-03-01") // opened in March: not in Jan/Feb

	pts := expect[struct {
		Items []struct {
			Month string `json:"month"`
			Value int64  `json:"value"`
			PutIn int64  `json:"put_in"`
		} `json:"items"`
	}](t, h.do("GET", "/api/v1/savings/series?from=2026-01&to=2026-03", tok, nil), 200).Items
	want := []struct {
		m        string
		value, p int64
	}{{"2026-01", 100_000, 100_000}, {"2026-02", 130_000, 120_000}, {"2026-03", 180_000, 170_000}}
	if len(pts) != 3 {
		t.Fatalf("points %+v", pts)
	}
	for i, w := range want {
		if pts[i].Month != w.m || pts[i].Value != w.value || pts[i].PutIn != w.p {
			t.Errorf("point %d = %+v, want %+v", i, pts[i], w)
		}
	}
	for _, q := range []string{"from=2023-01&to=2026-03", "from=2026-01&to=2026-04", "from=2026-03&to=2026-01", "from=2026-01"} {
		if r := h.do("GET", "/api/v1/savings/series?"+q, tok, nil); r.Code != 422 && r.Code != 400 {
			t.Errorf("%s: %d", q, r.Code)
		}
	}
}

type summarySaved struct {
	Available      int64 `json:"available"`
	Saved          int64 `json:"saved"`
	SavedPlanned   int64 `json:"saved_planned"`
	SavedDeposited int64 `json:"saved_deposited"`
	SavedWithdrawn int64 `json:"saved_withdrawn"`
}

func TestDashboardAvailableIncludesSaved(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("sav-dash@example.com")
	h.income(tok, 1_000_000, 1, "2026-03")
	a := h.savingsAccount(tok, "A", "bank", "Nu", 0, "2026-03-01")
	h.savingsGoal(tok, M{"account_id": a, "name": "G", "target_amount": 10_000_000, "monthly_amount": 200_000})
	sum := func(month string) summarySaved {
		return expect[summarySaved](t, h.do("GET", "/api/v1/dashboard/summary?month="+month, tok, nil), 200)
	}
	if s := sum("2026-03"); s.Saved != 200_000 || s.SavedPlanned != 200_000 || s.Available != 800_000 {
		t.Fatalf("planned only %+v", s)
	}
	h.move(tok, M{"account_id": a, "kind": "deposit", "amount": 250_000, "occurred_on": "2026-03-05"})
	if s := sum("2026-03"); s.Saved != 250_000 || s.SavedDeposited != 250_000 || s.Available != 750_000 {
		t.Fatalf("over plan %+v", s)
	}
	h.move(tok, M{"account_id": a, "kind": "withdrawal", "amount": 100_000, "occurred_on": "2026-03-06"})
	if s := sum("2026-03"); s.Saved != 150_000 || s.SavedWithdrawn != 100_000 || s.Available != 850_000 {
		t.Fatalf("after withdrawal %+v", s)
	}
	if s := sum("2026-04"); s.Saved != 200_000 || s.SavedDeposited != 0 {
		t.Fatalf("future month %+v", s)
	}
	if s := sum("2026-02"); s.Saved != 0 { // before the goal existed
		t.Fatalf("past month %+v", s)
	}
}

func TestSavingsGoalDeleteKeepsMovements(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("sav-goal-del@example.com")
	a := h.savingsAccount(tok, "A", "bank", "Nu", 0, "2026-03-01")
	g := h.savingsGoal(tok, M{"account_id": a, "name": "G", "target_amount": 100_000, "monthly_amount": 20_000}).ID
	h.move(tok, M{"account_id": a, "kind": "deposit", "goal_id": g, "amount": 5_000, "occurred_on": "2026-03-02"})
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/savings-goals/%d", g), tok, nil); r.Code != 204 {
		t.Fatalf("delete goal %d", r.Code)
	}
	moves := expect[struct {
		Items []M `json:"items"`
	}](t, h.do("GET", fmt.Sprintf("/api/v1/savings-accounts/%d/movements", a), tok, nil), 200).Items
	if len(moves) != 1 || moves[0]["goal_id"] != nil {
		t.Fatalf("movement must stay, untagged: %v", moves)
	}
	if acc := h.getAccount(tok, a); acc.Balance != 5_000 {
		t.Fatalf("balance %+v", acc)
	}
	if s := expect[summarySaved](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-03", tok, nil), 200); s.SavedPlanned != 0 || s.Saved != 5_000 {
		t.Fatalf("summary after delete %+v", s)
	}
}
