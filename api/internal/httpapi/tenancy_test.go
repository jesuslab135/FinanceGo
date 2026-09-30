package httpapi_test

import (
	"fmt"
	"testing"
)

// TestCrossTenantMatrix: user B must never read, change or reference user A's data.
func TestCrossTenantMatrix(t *testing.T) {
	h := newHarness(t)
	a := h.signup("alice@example.com")
	b := h.signup("bob@example.com")

	aCard := h.creditCard(a)
	aCat := h.catID(a, "Comida")
	aInc := h.income(a, 100000, 1, "2026-01")
	aFix := h.fixed(a, "Renta", 50000, 1, "2026-01", &aCard)
	aEntry := h.entries(a, "2026-03")[0].ID
	aExp := h.expense(a, "Comida", 1000, "2026-03-01", "", &aCard)
	aPay := int64(expect[M](t, h.do("POST", "/api/v1/card-payments", a, M{"payment_method_id": aCard, "amount": 100, "paid_on": "2026-03-01"}), 201)["id"].(float64))
	aPlan := h.msi(a, aCard, 3000, 3, "2026-03-01").ID
	expect[M](t, h.do("PUT", fmt.Sprintf("/api/v1/category-budgets/%d", aCat), a, M{"monthly_limit": 100}), 200)

	bCat := h.catID(b, "Comida")
	bHome := h.catID(b, "Vivienda")
	bEnt := h.catID(b, "Entretenimiento")
	bCard := h.creditCard(b)

	notFound := []struct {
		method, path string
		body         any
	}{
		{"PUT", fmt.Sprintf("/api/v1/categories/%d", aCat), M{"name": "x", "kind": "expense"}},
		{"DELETE", fmt.Sprintf("/api/v1/categories/%d", aCat), nil},
		{"GET", fmt.Sprintf("/api/v1/payment-methods/%d", aCard), nil},
		{"PUT", fmt.Sprintf("/api/v1/payment-methods/%d", aCard), M{"nickname": "x", "type": "credit", "statement_day": 1, "payment_due_day": 2}},
		{"DELETE", fmt.Sprintf("/api/v1/payment-methods/%d", aCard), nil},
		{"GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement", aCard), nil},
		{"PUT", fmt.Sprintf("/api/v1/income-sources/%d", aInc), M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01"}},
		{"DELETE", fmt.Sprintf("/api/v1/income-sources/%d", aInc), nil},
		{"PUT", fmt.Sprintf("/api/v1/fixed-payments/%d", aFix), M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": bHome}},
		{"DELETE", fmt.Sprintf("/api/v1/fixed-payments/%d", aFix), nil},
		{"PUT", fmt.Sprintf("/api/v1/entries/%d", aEntry), M{"amount": 1, "status": "skipped"}},
		{"PUT", fmt.Sprintf("/api/v1/expenses/%d", aExp), M{"category_id": bCat, "amount": 1, "spent_on": "2026-03-01"}},
		{"DELETE", fmt.Sprintf("/api/v1/expenses/%d", aExp), nil},
		{"DELETE", fmt.Sprintf("/api/v1/card-payments/%d", aPay), nil},
		{"PUT", fmt.Sprintf("/api/v1/installment-plans/%d", aPlan), M{"payment_method_id": bCard, "category_id": bEnt, "description": "x", "total_amount": 300, "installments": 3, "purchased_on": "2026-03-01"}},
		{"DELETE", fmt.Sprintf("/api/v1/installment-plans/%d", aPlan), nil},
		{"DELETE", fmt.Sprintf("/api/v1/category-budgets/%d", aCat), nil},
	}
	for _, c := range notFound {
		if r := h.do(c.method, c.path, b, c.body); r.Code != 404 {
			t.Errorf("%s %s: %d %s (want 404)", c.method, c.path, r.Code, r.Body)
		}
	}

	badRef := []struct {
		method, path string
		body         any
	}{
		{"POST", "/api/v1/expenses", M{"category_id": aCat, "amount": 1, "spent_on": "2026-03-01"}},
		{"POST", "/api/v1/expenses", M{"category_id": bCat, "amount": 1, "spent_on": "2026-03-01", "payment_method_id": aCard}},
		{"POST", "/api/v1/fixed-payments", M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": bHome, "payment_method_id": aCard}},
		{"POST", "/api/v1/income-sources", M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": aCat}},
		{"POST", "/api/v1/card-payments", M{"payment_method_id": aCard, "amount": 1, "paid_on": "2026-03-01"}},
		{"POST", "/api/v1/installment-plans", M{"payment_method_id": aCard, "category_id": bEnt, "description": "x", "total_amount": 300, "installments": 3, "purchased_on": "2026-03-01"}},
		{"PUT", fmt.Sprintf("/api/v1/category-budgets/%d", aCat), M{"monthly_limit": 100}},
		{"DELETE", fmt.Sprintf("/api/v1/categories/%d?reassign_to=%d", bCat, aCat), nil},
	}
	for _, c := range badRef {
		if r := h.do(c.method, c.path, b, c.body); r.Code != 422 || errCode(r) != "invalid_reference" {
			t.Errorf("%s %s: %d %s (want 422 invalid_reference)", c.method, c.path, r.Code, r.Body)
		}
	}

	// B's lists and dashboards contain nothing of A's.
	for _, path := range []string{"/api/v1/expenses", "/api/v1/income-sources", "/api/v1/fixed-payments", "/api/v1/card-payments",
		"/api/v1/installment-plans", "/api/v1/category-budgets", fmt.Sprintf("/api/v1/expenses?category_id=%d", aCat)} {
		if l := expect[list[M]](t, h.do("GET", path, b, nil), 200); len(l.Items) != 0 {
			t.Errorf("%s leaked %d items", path, len(l.Items))
		}
	}
	if s := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-03", b, nil), 200); s.Income != 0 || s.Spent != 0 {
		t.Errorf("summary leaked %+v", s)
	}
	if es := h.entries(b, "2026-03"); len(es) != 0 {
		t.Errorf("entries leaked %+v", es)
	}
}
