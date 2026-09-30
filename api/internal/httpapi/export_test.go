package httpapi_test

import (
	"context"
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
