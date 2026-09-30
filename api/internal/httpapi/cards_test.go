package httpapi_test

import (
	"context"
	"fmt"
	"testing"
	"time"
)

type plan struct {
	ID                int64   `json:"id"`
	Description       string  `json:"description"`
	TotalAmount       int64   `json:"total_amount"`
	Installments      int32   `json:"installments"`
	CancelledOn       *string `json:"cancelled_on"`
	InstallmentAmount int64   `json:"installment_amount"`
	BilledCount       int32   `json:"billed_count"`
	RemainingAmount   int64   `json:"remaining_amount"`
	FirstCycle        string  `json:"first_cycle"`
}

type statement struct {
	Cycle          string   `json:"cycle"`
	OpensOn        string   `json:"opens_on"`
	ClosesOn       string   `json:"closes_on"`
	DueOn          string   `json:"due_on"`
	BilledBalance  int64    `json:"billed_balance"`
	AmountDue      int64    `json:"amount_due"`
	CurrentBalance int64    `json:"current_balance"`
	CreditLimit    *int64   `json:"credit_limit"`
	Utilization    *float64 `json:"utilization"`
	Charges        []struct {
		Date   string `json:"date"`
		Amount int64  `json:"amount"`
		Source string `json:"source"`
	} `json:"charges"`
	Installments []struct {
		No     int32 `json:"no"`
		Of     int32 `json:"of"`
		Amount int64 `json:"amount"`
	} `json:"installments"`
	Payments []struct {
		Amount int64 `json:"amount"`
	} `json:"payments"`
	PaymentsAfterClose []struct {
		Amount int64  `json:"amount"`
		PaidOn string `json:"paid_on"`
	} `json:"payments_after_close"`
}

func (h *harness) msi(tok string, card int64, total int64, n int, on string) plan {
	h.t.Helper()
	return expect[plan](h.t, h.do("POST", "/api/v1/installment-plans", tok, M{
		"payment_method_id": card, "category_id": h.catID(tok, "Entretenimiento"), "description": "TV",
		"total_amount": total, "installments": n, "purchased_on": on,
	}), 201)
}

func TestCardPayments(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("pay@example.com")
	cc := h.creditCard(tok)
	deb := expect[paymentMethod](t, h.do("POST", "/api/v1/payment-methods", tok, M{"nickname": "Débito", "type": "debit"}), 201).ID

	p := expect[M](t, h.do("POST", "/api/v1/card-payments", tok, M{"payment_method_id": cc, "amount": 50000, "paid_on": "2026-03-01", "note": "abono"}), 201)
	if r := h.do("POST", "/api/v1/card-payments", tok, M{"payment_method_id": deb, "amount": 1, "paid_on": "2026-03-01"}); r.Code != 422 {
		t.Fatalf("payment to debit card: %d", r.Code)
	}
	l := expect[list[M]](t, h.do("GET", fmt.Sprintf("/api/v1/card-payments?payment_method_id=%d", cc), tok, nil), 200)
	if len(l.Items) != 1 {
		t.Fatalf("list %v", l.Items)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/card-payments/%v", p["id"]), tok, nil); r.Code != 204 {
		t.Fatalf("delete %d", r.Code)
	}
}

func TestInstallmentPlanEntriesAndStatement(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("msi@example.com")
	cc := h.creditCard(tok) // closes 15th, due 5th, opening balance 0 from 2026-01-01
	pl := h.msi(tok, cc, 100000, 3, "2026-03-10")
	// Today (03-15) is the March cut-off day, so installment 1 already counts as billed.
	if pl.InstallmentAmount != 33333 || pl.FirstCycle != "2026-03" || pl.BilledCount != 1 || pl.RemainingAmount != 66667 {
		t.Fatalf("plan %+v", pl)
	}

	ins := byKind(h.entries(tok, "2026-03"), "installment")
	if len(ins) != 1 || ins[0].Name != "TV 1/3" || ins[0].Amount != 33333 || ins[0].DueDate != "2026-04-05" {
		t.Fatalf("march installment %+v", ins)
	}
	if may := byKind(h.entries(tok, "2026-05"), "installment"); len(may) != 1 || may[0].Amount != 33334 {
		t.Fatalf("last installment takes remainder: %+v", may)
	}
	if jun := byKind(h.entries(tok, "2026-06"), "installment"); len(jun) != 0 {
		t.Fatalf("june has installment: %+v", jun)
	}

	h.expense(tok, "Comida", 20000, "2026-03-01", "súper", &cc)
	h.expense(tok, "Comida", 5000, "2026-03-16", "café", &cc) // next cycle
	h.fixed(tok, "Netflix", 30000, 10, "2026-03", &cc)
	nf := byKind(h.entries(tok, "2026-03"), "fixed")[0]
	expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", nf.ID), tok, M{"amount": 30000, "status": "paid", "settled_on": "2026-03-10", "payment_method_id": cc}), 200)
	expect[M](t, h.do("POST", "/api/v1/card-payments", tok, M{"payment_method_id": cc, "amount": 10000, "paid_on": "2026-03-05"}), 201)

	st := expect[statement](t, h.do("GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement?cycle=2026-03", cc), tok, nil), 200)
	// billed: 20000 + 30000 (Netflix paid) + 33333 (1/3) - 10000
	if st.OpensOn != "2026-02-16" || st.ClosesOn != "2026-03-15" || st.DueOn != "2026-04-05" || st.BilledBalance != 73333 || st.AmountDue != 73333 {
		t.Fatalf("statement %+v", st)
	}
	// current: 20000 + 5000 + 30000 + 100000 (whole plan) - 10000
	if st.CurrentBalance != 145000 || st.Utilization == nil || *st.Utilization != 2.9 {
		t.Fatalf("current %d util %v", st.CurrentBalance, st.Utilization)
	}
	if len(st.Charges) != 2 || len(st.Installments) != 1 || st.Installments[0].No != 1 || st.Installments[0].Of != 3 || len(st.Payments) != 1 {
		t.Fatalf("lines %+v", st)
	}
	// A payment after the cut-off but before the due date lowers amount_due and is
	// listed under payments_after_close, not payments.
	expect[M](t, h.do("POST", "/api/v1/card-payments", tok, M{"payment_method_id": cc, "amount": 3333, "paid_on": "2026-03-15"}), 201)
	h.setNow(time.Date(2026, 3, 20, 18, 0, 0, 0, time.UTC))
	tok = h.login("msi@example.com")
	expect[M](t, h.do("POST", "/api/v1/card-payments", tok, M{"payment_method_id": cc, "amount": 50000, "paid_on": "2026-03-20"}), 201)
	st = expect[statement](t, h.do("GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement?cycle=2026-03", cc), tok, nil), 200)
	if len(st.Payments) != 2 || len(st.PaymentsAfterClose) != 1 || st.PaymentsAfterClose[0].PaidOn != "2026-03-20" || st.AmountDue != 20000 {
		t.Fatalf("after close: payments=%+v after=%+v due=%d", st.Payments, st.PaymentsAfterClose, st.AmountDue)
	}
	h.setNow(time.Date(2026, 3, 15, 18, 0, 0, 0, time.UTC))
	tok = h.login("msi@example.com")
	def := expect[statement](t, h.do("GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement", cc), tok, nil), 200)
	if def.Cycle != "2026-03" {
		t.Fatalf("default cycle %s", def.Cycle)
	}
	deb := expect[paymentMethod](t, h.do("POST", "/api/v1/payment-methods", tok, M{"nickname": "Débito", "type": "debit"}), 201).ID
	if r := h.do("GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement", deb), tok, nil); r.Code != 422 || errCode(r) != "not_a_credit_card" {
		t.Fatalf("debit statement: %d %s", r.Code, r.Body)
	}
}

func TestInstallmentPlanLockAndCancel(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("lock@example.com")
	cc := h.creditCard(tok)
	pl := h.msi(tok, cc, 90000, 3, "2026-03-16") // after the March cut-off: first cycle is April
	h.entries(tok, "2026-05")                    // materialize 2/3

	// Before any cycle closes the plan is fully editable.
	body := M{"payment_method_id": cc, "category_id": h.catID(tok, "Entretenimiento"), "description": "TV 55",
		"total_amount": 120000, "installments": 4, "purchased_on": "2026-03-16"}
	up := expect[plan](t, h.do("PUT", fmt.Sprintf("/api/v1/installment-plans/%d", pl.ID), tok, body), 200)
	if up.InstallmentAmount != 30000 || up.Installments != 4 {
		t.Fatalf("edit %+v", up)
	}
	if may := byKind(h.entries(tok, "2026-05"), "installment"); len(may) != 1 || may[0].Name != "TV 55 2/4" || may[0].Amount != 30000 {
		t.Fatalf("regenerated may %+v", may)
	}

	h.setNow(time.Date(2026, 4, 20, 18, 0, 0, 0, time.UTC)) // April cycle has closed
	tok = h.login("lock@example.com")
	body["total_amount"] = 130000
	if r := h.do("PUT", fmt.Sprintf("/api/v1/installment-plans/%d", pl.ID), tok, body); r.Code != 409 || errCode(r) != "plan_locked" {
		t.Fatalf("locked edit: %d %s", r.Code, r.Body)
	}
	body["total_amount"] = 120000
	body["description"] = "Pantalla"
	expect[plan](t, h.do("PUT", fmt.Sprintf("/api/v1/installment-plans/%d", pl.ID), tok, body), 200)
	if may := byKind(h.entries(tok, "2026-05"), "installment"); may[0].Name != "Pantalla 2/4" {
		t.Fatalf("relabel %+v", may)
	}

	c := expect[plan](t, h.do("DELETE", fmt.Sprintf("/api/v1/installment-plans/%d", pl.ID), tok, nil), 200)
	if c.CancelledOn == nil || *c.CancelledOn != "2026-04-20" || c.RemainingAmount != 0 || c.BilledCount != 1 {
		t.Fatalf("cancel %+v", c)
	}
	if may := byKind(h.entries(tok, "2026-05"), "installment"); len(may) != 0 {
		t.Fatalf("may installment kept after cancel: %+v", may)
	}
	if apr := byKind(h.entries(tok, "2026-04"), "installment"); len(apr) != 1 {
		t.Fatalf("billed april installment removed: %+v", apr)
	}
	st := expect[statement](t, h.do("GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement?cycle=2026-04", cc), tok, nil), 200)
	if st.CurrentBalance != 30000 {
		t.Fatalf("current after cancel %d, want 30000", st.CurrentBalance)
	}
	active := expect[list[plan]](t, h.do("GET", "/api/v1/installment-plans?active_only=true", tok, nil), 200)
	if len(active.Items) != 0 {
		t.Fatalf("active plans %+v", active.Items)
	}
}

func TestInstallmentPlanStructuralEditDropsPaidRows(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("drop@example.com")
	cc := h.creditCard(tok)
	pl := h.msi(tok, cc, 120000, 4, "2026-03-16") // first cycle April: May is 2/4
	may := byKind(h.entries(tok, "2026-05"), "installment")
	if len(may) != 1 {
		t.Fatalf("may %+v", may)
	}
	expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", may[0].ID), tok, M{"amount": may[0].Amount, "status": "paid", "payment_method_id": cc}), 200)
	body := M{"payment_method_id": cc, "category_id": h.catID(tok, "Entretenimiento"), "description": "TV",
		"total_amount": 90000, "installments": 3, "purchased_on": "2026-03-16"}
	expect[plan](t, h.do("PUT", fmt.Sprintf("/api/v1/installment-plans/%d", pl.ID), tok, body), 200)
	may = byKind(h.entries(tok, "2026-05"), "installment")
	if len(may) != 1 || may[0].Name != "TV 2/3" || may[0].Amount != 30000 || may[0].Status != "pending" {
		t.Fatalf("regenerated may %+v", may)
	}
	var n int
	if err := h.pool.QueryRow(context.Background(), `SELECT count(*) FROM monthly_entries WHERE installment_plan_id = $1 AND installment_no > 3`, pl.ID).Scan(&n); err != nil || n != 0 {
		t.Fatalf("orphans %d %v", n, err)
	}
}

// Changing a card's cut-off day remaps pending installment rows to their new months.
func TestCardCycleChangeRemapsInstallments(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("cycle@example.com")
	cc := h.creditCard(tok) // closes 15th, due 5th
	h.msi(tok, cc, 90000, 3, "2026-03-20")
	if apr := byKind(h.entries(tok, "2026-04"), "installment"); len(apr) != 1 || apr[0].Name != "TV 1/3" {
		t.Fatalf("april before change %+v", apr)
	}
	expect[paymentMethod](t, h.do("PUT", fmt.Sprintf("/api/v1/payment-methods/%d", cc), tok, M{
		"nickname": "BBVA Oro", "type": "credit", "bank": "BBVA", "network": "visa", "last4": "4242",
		"credit_limit": 5000000, "statement_day": 25, "payment_due_day": 5,
		"opening_balance": 0, "opening_balance_date": "2026-01-01",
	}), 200)
	if mar := byKind(h.entries(tok, "2026-03"), "installment"); len(mar) != 1 || mar[0].Name != "TV 1/3" {
		t.Fatalf("march after change %+v", mar)
	}
	if apr := byKind(h.entries(tok, "2026-04"), "installment"); len(apr) != 1 || apr[0].Name != "TV 2/3" {
		t.Fatalf("april after change %+v", apr)
	}
	if s := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-04", tok, nil), 200); s.Installments != 30000 {
		t.Fatalf("april summary installments %d", s.Installments)
	}
}
