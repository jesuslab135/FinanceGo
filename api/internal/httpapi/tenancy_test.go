package httpapi_test

import (
	"fmt"
	"slices"
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
	bExp := h.expense(b, "Comida", 1000, "2026-03-01", "", nil)
	bFix := h.fixed(b, "Gym", 500, 1, "2026-01", nil)
	bInc := h.income(b, 1000, 1, "2026-01")
	bPlan := h.msi(b, bCard, 3000, 3, "2026-03-20").ID
	bPlanBody := func(pm, cat int64) M {
		return M{"payment_method_id": pm, "category_id": cat, "description": "TV", "total_amount": 3000, "installments": 3, "purchased_on": "2026-03-20"}
	}

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
		// B updates B's own resource but references A's ids.
		{"PUT", fmt.Sprintf("/api/v1/expenses/%d", bExp), M{"category_id": aCat, "amount": 1, "spent_on": "2026-03-01"}},
		{"PUT", fmt.Sprintf("/api/v1/expenses/%d", bExp), M{"category_id": bCat, "payment_method_id": aCard, "amount": 1, "spent_on": "2026-03-01"}},
		{"PUT", fmt.Sprintf("/api/v1/fixed-payments/%d", bFix), M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": bHome, "payment_method_id": aCard}},
		{"PUT", fmt.Sprintf("/api/v1/fixed-payments/%d", bFix), M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": aCat}},
		{"PUT", fmt.Sprintf("/api/v1/income-sources/%d", bInc), M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": aCat}},
		{"PUT", fmt.Sprintf("/api/v1/installment-plans/%d", bPlan), bPlanBody(aCard, bEnt)},
		{"PUT", fmt.Sprintf("/api/v1/installment-plans/%d", bPlan), bPlanBody(bCard, aCat)},
		{"POST", "/api/v1/fixed-payments", M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": aCat}},
	}
	for _, c := range badRef {
		if r := h.do(c.method, c.path, b, c.body); r.Code != 422 || errCode(r) != "invalid_reference" {
			t.Errorf("%s %s: %d %s (want 422 invalid_reference)", c.method, c.path, r.Code, r.Body)
		}
	}

	// B's lists contain only B's own rows (ids in mine), never A's.
	lists := []struct {
		path string
		mine []int64
	}{
		{"/api/v1/expenses", []int64{bExp}},
		{"/api/v1/income-sources", []int64{bInc}},
		{"/api/v1/fixed-payments", []int64{bFix}},
		{"/api/v1/card-payments", nil},
		{"/api/v1/installment-plans", []int64{bPlan}},
		{"/api/v1/category-budgets", nil},
		{fmt.Sprintf("/api/v1/expenses?category_id=%d", aCat), nil},
	}
	for _, c := range lists {
		for _, it := range expect[list[M]](t, h.do("GET", c.path, b, nil), 200).Items {
			id, _ := it["id"].(float64)
			if !slices.Contains(c.mine, int64(id)) {
				t.Errorf("%s leaked %v", c.path, it)
			}
		}
	}
	// B's income is 1000 (its own source); A's 100000 must not show up.
	if s := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-03", b, nil), 200); s.Income != 1000 {
		t.Errorf("summary leaked %+v", s)
	}
	aEntries := map[int64]bool{}
	for _, e := range h.entries(a, "2026-03") {
		aEntries[e.ID] = true
	}
	for _, e := range h.entries(b, "2026-03") {
		if aEntries[e.ID] {
			t.Errorf("entries leaked %+v", e)
		}
	}
}
