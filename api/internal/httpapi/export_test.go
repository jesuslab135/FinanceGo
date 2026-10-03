package httpapi_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestExportExpensesCSV(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("csv@example.com")
	cc := h.creditCard(tok)
	h.expense(tok, "Comida", 12345, "2026-03-02", `Tacos "El Güero", centro`, &cc)
	h.expense(tok, "Salud", 500, "2026-03-01", "", nil)
	h.expense(tok, "Salud", 999, "2026-04-01", "fuera de rango", nil)

	r := h.do("GET", "/api/v1/export/expenses.csv?from=2026-03-01&to=2026-03-31", tok, nil)
	if r.Code != 200 || !strings.HasPrefix(r.Header.Get("Content-Type"), "text/csv") ||
		!strings.Contains(r.Header.Get("Content-Disposition"), `filename="expenses_2026-03-01_2026-03-31.csv"`) {
		t.Fatalf("headers %d %v", r.Code, r.Header)
	}
	want := "\ufeffdate,category,payment_method,description,amount\n" +
		"2026-03-01,Salud,,,5.00\n" +
		"2026-03-02,Comida,BBVA Oro,\"Tacos \"\"El Güero\"\", centro\",123.45\n"
	if string(r.Body) != want {
		t.Fatalf("csv:\n%q\nwant:\n%q", r.Body, want)
	}
	if r := h.do("GET", "/api/v1/export/expenses.csv", tok, nil); r.Code != 400 {
		t.Fatalf("missing range: %d", r.Code)
	}
}

func TestExportEntriesCSV(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("csv2@example.com")
	h.fixed(tok, "Renta", 1000000, 1, "2026-03", nil)
	h.entries(tok, "2026-03")
	r := h.do("GET", "/api/v1/export/entries.csv?from=2026-03-01&to=2026-03-31", tok, nil)
	want := "\ufeffmonth,kind,name,category,payment_method,due_date,status,amount\n" +
		"2026-03,fixed,Renta,Vivienda,,2026-03-01,pending,10000.00\n"
	if r.Code != 200 || string(r.Body) != want {
		t.Fatalf("entries csv %d:\n%q", r.Code, r.Body)
	}
}

func TestDeleteAccount(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("bye@example.com")
	if r := h.do("DELETE", "/api/v1/me", tok, M{"password": "nope-nope"}); r.Code != 422 || errFields(r)["password"] == "" {
		t.Fatalf("wrong password: %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", "/api/v1/me", tok, M{"password": "password123"}); r.Code != 204 {
		t.Fatalf("delete: %d %s", r.Code, r.Body)
	}
	if r := h.do("GET", "/api/v1/me", tok, nil); r.Code != 401 {
		t.Fatalf("token still works: %d", r.Code)
	}
	var n int
	_ = h.pool.QueryRow(context.Background(), "SELECT count(*) FROM categories").Scan(&n)
	if n != 0 {
		t.Fatalf("categories left behind: %d", n)
	}
}

func TestExportEscapesFormulaCells(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("inj@example.com")
	h.expense(tok, "Comida", 100, "2026-03-02", "=SUM(A1)", nil)
	r := h.do("GET", "/api/v1/export/expenses.csv?from=2026-03-01&to=2026-03-31", tok, nil)
	if !strings.Contains(string(r.Body), "2026-03-02,Comida,,'=SUM(A1),1.00\n") {
		t.Fatalf("formula not neutralised: %q", r.Body)
	}
}

func TestDeleteAccountWithData(t *testing.T) {
	h := newHarness(t)
	a := h.signup("full@example.com")
	b := h.signup("keep@example.com")
	card := h.creditCard(a)
	h.expense(a, "Comida", 1000, "2026-03-01", "", &card)
	h.fixed(a, "Renta", 50000, 1, "2026-01", &card)
	h.income(a, 100000, 1, "2026-01")
	h.msi(a, card, 3000, 3, "2026-03-01")
	expect[M](t, h.do("POST", "/api/v1/card-payments", a, M{"payment_method_id": card, "amount": 100, "paid_on": "2026-03-01"}), 201)
	expect[M](t, h.do("PUT", fmt.Sprintf("/api/v1/category-budgets/%d", h.catID(a, "Comida")), a, M{"monthly_limit": 100}), 200)
	h.entries(a, "2026-03")
	bExp := h.expense(b, "Comida", 700, "2026-03-01", "", nil)

	ctx := context.Background()
	var uid int64
	if err := h.pool.QueryRow(ctx, "SELECT id FROM users WHERE email = 'full@example.com'").Scan(&uid); err != nil {
		t.Fatal(err)
	}
	if r := h.do("DELETE", "/api/v1/me", a, M{"password": "password123"}); r.Code != 204 {
		t.Fatalf("delete: %d %s", r.Code, r.Body)
	}
	for _, tbl := range []string{"refresh_tokens", "categories", "payment_methods", "income_sources", "fixed_payments",
		"installment_plans", "monthly_entries", "expenses", "card_payments", "category_budgets"} {
		var n int
		if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM "+tbl+" WHERE user_id = $1", uid).Scan(&n); err != nil || n != 0 {
			t.Errorf("%s: %d rows left (err %v)", tbl, n, err)
		}
	}
	var nu int
	if err := h.pool.QueryRow(ctx, "SELECT count(*) FROM users WHERE id = $1", uid).Scan(&nu); err != nil || nu != 0 {
		t.Fatal(err)
	}
	l := expect[list[M]](t, h.do("GET", "/api/v1/expenses", b, nil), 200)
	if len(l.Items) != 1 || int64(l.Items[0]["id"].(float64)) != bExp {
		t.Fatalf("other user's data affected: %v", l.Items)
	}
}
