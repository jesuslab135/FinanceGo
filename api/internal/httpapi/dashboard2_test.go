package httpapi_test

import (
	"fmt"
	"testing"
	"time"
)

type point struct {
	Start     string `json:"start"`
	Expenses  int64  `json:"expenses"`
	Committed int64  `json:"committed"`
}

type breakdown struct {
	ID     *int64 `json:"id"`
	Name   string `json:"name"`
	Amount int64  `json:"amount"`
}

func TestSeries(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("series@example.com")
	h.expense(tok, "Comida", 100, "2026-03-01", "", nil)
	h.expense(tok, "Comida", 200, "2026-03-03", "", nil)
	h.fixed(tok, "Renta", 1000, 5, "2026-01", nil)

	day := expect[list[point]](t, h.do("GET", "/api/v1/dashboard/series?period=day&from=2026-03-01&to=2026-03-05", tok, nil), 200).Items
	if len(day) != 5 || day[0].Expenses != 100 || day[1].Expenses != 0 || day[2].Expenses != 200 || day[4].Committed != 1000 {
		t.Fatalf("day %+v", day)
	}
	week := expect[list[point]](t, h.do("GET", "/api/v1/dashboard/series?period=week&from=2026-03-01&to=2026-03-15", tok, nil), 200).Items
	if len(week) != 3 || week[0].Start != "2026-02-23" || week[0].Expenses != 100 || week[1].Expenses != 200 || week[1].Committed != 1000 {
		t.Fatalf("week %+v", week)
	}
	month := expect[list[point]](t, h.do("GET", "/api/v1/dashboard/series?period=month&from=2026-01-01&to=2026-03-31", tok, nil), 200).Items
	if len(month) != 3 || month[0].Committed != 1000 || month[2].Expenses != 300 {
		t.Fatalf("month %+v", month)
	}
	for _, q := range []string{"period=year&from=2026-01-01&to=2026-01-02", "period=day&from=2026-03-02&to=2026-03-01", "period=day&from=2025-01-01&to=2026-03-01"} {
		if r := h.do("GET", "/api/v1/dashboard/series?"+q, tok, nil); r.Code != 422 {
			t.Errorf("%s: %d", q, r.Code)
		}
	}
}

func TestBreakdown(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("brk@example.com")
	cc := h.creditCard(tok)
	h.expense(tok, "Comida", 400, "2026-03-01", "", &cc)
	h.expense(tok, "Comida", 200, "2026-03-02", "", nil)
	h.expense(tok, "Transporte", 100, "2026-03-02", "", nil)

	cat := expect[list[breakdown]](t, h.do("GET", "/api/v1/dashboard/breakdown?by=category&from=2026-03-01&to=2026-03-31", tok, nil), 200).Items
	if len(cat) != 2 || cat[0].Name != "Comida" || cat[0].Amount != 600 {
		t.Fatalf("by category %+v", cat)
	}
	pm := expect[list[breakdown]](t, h.do("GET", "/api/v1/dashboard/breakdown?by=payment_method&from=2026-03-01&to=2026-03-31", tok, nil), 200).Items
	if len(pm) != 2 || pm[0].ID == nil || *pm[0].ID != cc || pm[0].Amount != 400 || pm[1].ID != nil || pm[1].Amount != 300 {
		t.Fatalf("by payment method %+v", pm)
	}
	if r := h.do("GET", "/api/v1/dashboard/breakdown?by=color&from=2026-03-01&to=2026-03-31", tok, nil); r.Code != 422 {
		t.Fatalf("bad by: %d", r.Code)
	}
}

func TestCardsOverviewAndUpcoming(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("up@example.com")
	cc := h.creditCard(tok) // closes 15, due 5
	h.expense(tok, "Comida", 40000, "2026-03-10", "", &cc)
	h.fixed(tok, "Luz", 50000, 10, "2026-03", nil)      // due 03-10, pending → overdue
	h.fixed(tok, "Internet", 60000, 20, "2026-03", nil) // due 03-20

	cards := expect[list[M]](t, h.do("GET", "/api/v1/dashboard/cards", tok, nil), 200).Items
	if len(cards) != 1 || cards[0]["amount_due"].(float64) != 40000 || cards[0]["due_on"] != "2026-04-05" || cards[0]["current_balance"].(float64) != 40000 {
		t.Fatalf("cards %+v", cards)
	}

	// Window 03-15..04-14 (+30 days back for overdue): Luz 03-10 (overdue), Internet 03-20,
	// card due 04-05, Luz 04-10.
	up := expect[list[M]](t, h.do("GET", "/api/v1/dashboard/upcoming?days=30", tok, nil), 200).Items
	if len(up) != 4 {
		t.Fatalf("upcoming %+v", up)
	}
	if up[0]["name"] != "Luz" || up[0]["overdue"] != true || up[1]["name"] != "Internet" || up[2]["type"] != "card" ||
		up[2]["date"] != "2026-04-05" || up[3]["date"] != "2026-04-10" || up[3]["overdue"] != false {
		t.Fatalf("order/flags %+v", up)
	}
	if short := expect[list[M]](t, h.do("GET", "/api/v1/dashboard/upcoming?days=7", tok, nil), 200).Items; len(short) != 2 {
		t.Fatalf("7-day window %+v", short)
	}
	if r := h.do("GET", "/api/v1/dashboard/upcoming?days=90", tok, nil); r.Code != 422 {
		t.Fatalf("days=90: %d", r.Code)
	}
	_ = fmt.Sprint(cc)
}

// A deactivated card that still owes money stays on the cards overview and in
// upcoming dues; one with a zero balance drops off.
func TestCardsOverviewKeepsInactiveCardsWithBalance(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("inactive-cards@example.com")
	owing := h.creditCard(tok)
	paidOff := h.creditCard(tok)
	h.expense(tok, "Comida", 20000, "2026-03-01", "", &owing)
	for _, id := range []int64{owing, paidOff} {
		expect[paymentMethod](t, h.do("PUT", fmt.Sprintf("/api/v1/payment-methods/%d", id), tok, M{
			"nickname": "BBVA Oro", "type": "credit", "credit_limit": 5000000, "statement_day": 15, "payment_due_day": 5,
			"opening_balance": 0, "opening_balance_date": "2026-01-01", "active": false,
		}), 200)
	}
	cs := expect[list[M]](t, h.do("GET", "/api/v1/dashboard/cards", tok, nil), 200).Items
	if len(cs) != 1 || cs[0]["payment_method_id"] != float64(owing) || cs[0]["current_balance"] != float64(20000) {
		t.Fatalf("cards %v", cs)
	}
	up := expect[list[M]](t, h.do("GET", "/api/v1/dashboard/upcoming?days=30", tok, nil), 200).Items
	if len(up) != 1 || up[0]["type"] != "card" || up[0]["amount"] != float64(20000) {
		t.Fatalf("upcoming %v", up)
	}
}

// Budget pct is clamped so a tiny limit cannot overflow int32.
func TestBudgetPctClamped(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("pct@example.com")
	food := h.catID(tok, "Comida")
	expect[M](t, h.do("PUT", fmt.Sprintf("/api/v1/category-budgets/%d", food), tok, M{"monthly_limit": 1}), 200)
	h.expense(tok, "Comida", 100000000, "2026-03-10", "", nil)
	s := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-03", tok, nil), 200)
	if len(s.Budgets) != 1 || s.Budgets[0].Pct != 100000 {
		t.Fatalf("budgets %+v", s.Budgets)
	}
}

type nextPay struct {
	Date      string `json:"date"`
	Amount    int64  `json:"amount"`
	Days      int32  `json:"days"`
	Available *int64 `json:"available"`
	PerDay    *int64 `json:"per_day"`
}

func (h *harness) nextPay(tok, query string) *nextPay {
	h.t.Helper()
	return expect[struct {
		NextPay *nextPay `json:"next_pay"`
	}](h.t, h.do("GET", "/api/v1/dashboard/summary"+query, tok, nil), 200).NextPay
}

// The summary tells a weekly earner when the next pay lands and what is in
// hand until then, instead of only the whole month's income.
func TestSummaryNextPay(t *testing.T) {
	h := newHarness(t) // today 2026-03-15, a Sunday
	tok := h.signup("nextpay@example.com")
	if np := h.nextPay(tok, ""); np != nil {
		t.Fatalf("no income yet: %+v", np)
	}
	// Fridays: March 6, 13, 20, 27. Two have arrived by the 15th.
	expect[incomeSource](t, h.do("POST", "/api/v1/income-sources", tok, M{
		"name": "Salario", "amount": 500000, "start_month": "2026-03", "frequency": "weekly", "anchor_date": "2026-03-06",
	}), 201)
	h.fixed(tok, "Luz", 80000, 10, "2026-03", nil)    // overdue, still to pay
	h.fixed(tok, "Renta", 300000, 18, "2026-03", nil) // due before the next payday
	h.fixed(tok, "Gym", 50000, 25, "2026-03", nil)    // after it: not counted yet
	h.expense(tok, "Comida", 120000, "2026-03-14", "super", nil)

	np := h.nextPay(tok, "")
	if np == nil || np.Date != "2026-03-20" || np.Amount != 500000 || np.Days != 5 {
		t.Fatalf("next pay %+v", np)
	}
	if want := int64(2*500000 - 80000 - 300000 - 120000); np.Available == nil || *np.Available != want || *np.PerDay != want/5 {
		t.Fatalf("available until next pay: %+v, want %d", np, want)
	}
	// Other months carry no pay-period figure.
	if np := h.nextPay(tok, "?month=2026-04"); np != nil {
		t.Fatalf("april: %+v", np)
	}

	// After the month's last payday the next one is in the following month, and
	// that month's bills due before it count.
	h.setNow(time.Date(2026, 3, 28, 12, 0, 0, 0, time.UTC))
	tok = h.login("nextpay@example.com")
	h.fixed(tok, "Seguro", 40000, 2, "2026-04", nil)
	np = h.nextPay(tok, "")
	if np == nil || np.Date != "2026-04-03" || np.Days != 6 {
		t.Fatalf("next pay across months %+v", np)
	}
	if want := int64(4*500000 - 80000 - 300000 - 50000 - 40000 - 120000); *np.Available != want {
		t.Fatalf("available across months %d, want %d", *np.Available, want)
	}
}

// Before the month's first payday nothing has arrived, so there is a date but no amount in hand.
func TestSummaryNextPayBeforeFirstPayday(t *testing.T) {
	h := newHarness(t) // today 2026-03-15
	tok := h.signup("nextpay2@example.com")
	h.income(tok, 2000000, 30, "2026-03")
	np := h.nextPay(tok, "")
	if np == nil || np.Date != "2026-03-30" || np.Amount != 2000000 || np.Available != nil || np.PerDay != nil {
		t.Fatalf("next pay %+v", np)
	}
}
