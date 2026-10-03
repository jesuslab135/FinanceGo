package httpapi_test

import (
	"context"
	"fmt"
	"testing"
)

type paymentMethod struct {
	ID                 int64   `json:"id"`
	Nickname           string  `json:"nickname"`
	Type               string  `json:"type"`
	Last4              *string `json:"last4"`
	Active             bool    `json:"active"`
	CreditLimit        *int64  `json:"credit_limit"`
	StatementDay       *int32  `json:"statement_day"`
	PaymentDueDay      *int32  `json:"payment_due_day"`
	OpeningBalance     int64   `json:"opening_balance"`
	OpeningBalanceDate *string `json:"opening_balance_date"`
}

// creditCard creates a credit card closing on day 15, due on day 5.
func (h *harness) creditCard(tok string) int64 {
	h.t.Helper()
	return expect[paymentMethod](h.t, h.do("POST", "/api/v1/payment-methods", tok, M{
		"nickname": "BBVA Oro", "type": "credit", "bank": "BBVA", "network": "visa", "last4": "4242",
		"credit_limit": 5000000, "statement_day": 15, "payment_due_day": 5,
		"opening_balance": 0, "opening_balance_date": "2026-01-01",
	}), 201).ID
}

func TestPaymentMethods(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("pm@example.com")

	cc := expect[paymentMethod](t, h.do("POST", "/api/v1/payment-methods", tok, M{
		"nickname": "BBVA Oro", "type": "credit", "last4": "4242", "credit_limit": 5000000,
		"statement_day": 15, "payment_due_day": 5, "opening_balance": 120000,
	}), 201)
	if !cc.Active || *cc.StatementDay != 15 || cc.OpeningBalance != 120000 || *cc.OpeningBalanceDate != "2026-03-15" {
		t.Fatalf("credit card %+v", cc)
	}
	deb := expect[paymentMethod](t, h.do("POST", "/api/v1/payment-methods", tok, M{"nickname": "Nómina", "type": "debit", "last4": "0001"}), 201)
	if deb.StatementDay != nil || deb.CreditLimit != nil {
		t.Fatalf("debit %+v", deb)
	}

	bad := []M{
		{"nickname": "x", "type": "debit", "statement_day": 3},
		{"nickname": "x", "type": "credit", "payment_due_day": 5},
		{"nickname": "x", "type": "debit", "last4": "12a4"},
		{"nickname": "Tarjeta 4111111111111111", "type": "debit"},
		{"nickname": "x", "type": "bitcoin"},
		{"nickname": "x", "type": "credit", "statement_day": 32, "payment_due_day": 5},
	}
	for i, b := range bad {
		if r := h.do("POST", "/api/v1/payment-methods", tok, b); r.Code != 422 {
			t.Errorf("bad[%d] accepted: %d %s", i, r.Code, r.Body)
		}
	}

	path := fmt.Sprintf("/api/v1/payment-methods/%d", deb.ID)
	if r := h.do("PUT", path, tok, M{"nickname": "Nómina", "type": "credit", "statement_day": 1, "payment_due_day": 20}); r.Code != 422 {
		t.Fatalf("type change allowed: %d", r.Code)
	}
	up := expect[paymentMethod](t, h.do("PUT", path, tok, M{"nickname": "Nómina BBVA", "type": "debit", "last4": nil, "active": false}), 200)
	if up.Nickname != "Nómina BBVA" || up.Last4 != nil || up.Active {
		t.Fatalf("update %+v", up)
	}
	got := expect[paymentMethod](t, h.do("GET", path, tok, nil), 200)
	if got.ID != deb.ID {
		t.Fatal("get mismatch")
	}
	if l := expect[list[paymentMethod]](t, h.do("GET", "/api/v1/payment-methods", tok, nil), 200); len(l.Items) != 2 {
		t.Fatalf("list %d", len(l.Items))
	}

	var uid int64
	ctx := context.Background()
	_ = h.pool.QueryRow(ctx, "SELECT user_id FROM payment_methods WHERE id=$1", cc.ID).Scan(&uid)
	if _, err := h.pool.Exec(ctx, "INSERT INTO card_payments (user_id,payment_method_id,amount,paid_on) VALUES ($1,$2,100,'2026-03-01')", uid, cc.ID); err != nil {
		t.Fatal(err)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/payment-methods/%d", cc.ID), tok, nil); r.Code != 409 || errCode(r) != "payment_method_in_use" {
		t.Fatalf("delete in use: %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", path, tok, nil); r.Code != 204 {
		t.Fatalf("delete unused: %d", r.Code)
	}
}
