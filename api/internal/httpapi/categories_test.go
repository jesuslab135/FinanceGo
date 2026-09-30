package httpapi_test

import (
	"context"
	"fmt"
	"testing"
)

type category struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Kind  string `json:"kind"`
	Color string `json:"color"`
}

type list[T any] struct {
	Items []T `json:"items"`
}

// catID returns the id of the user's category with the given name.
func (h *harness) catID(tok, name string) int64 {
	h.t.Helper()
	for _, c := range expect[list[category]](h.t, h.do("GET", "/api/v1/categories", tok, nil), 200).Items {
		if c.Name == name {
			return c.ID
		}
	}
	h.t.Fatalf("category %q not found", name)
	return 0
}

func TestCategoriesCRUD(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("cat@example.com")

	all := expect[list[category]](t, h.do("GET", "/api/v1/categories", tok, nil), 200)
	inc := expect[list[category]](t, h.do("GET", "/api/v1/categories?kind=income", tok, nil), 200)
	if len(all.Items) != 11 || len(inc.Items) != 2 {
		t.Fatalf("all=%d income=%d", len(all.Items), len(inc.Items))
	}

	c := expect[category](t, h.do("POST", "/api/v1/categories", tok, M{"name": " Mascotas ", "kind": "expense", "color": "#123abc"}), 201)
	if c.Name != "Mascotas" || c.Color != "#123abc" {
		t.Fatalf("created %+v", c)
	}
	if r := h.do("POST", "/api/v1/categories", tok, M{"name": "Mascotas", "kind": "expense"}); r.Code != 409 || errCode(r) != "category_exists" {
		t.Fatalf("dup: %d %s", r.Code, r.Body)
	}
	if r := h.do("POST", "/api/v1/categories", tok, M{"name": "", "kind": "other", "color": "red"}); r.Code != 422 || len(errFields(r)) != 3 {
		t.Fatalf("validation: %d %s", r.Code, r.Body)
	}
	up := expect[category](t, h.do("PUT", fmt.Sprintf("/api/v1/categories/%d", c.ID), tok, M{"name": "Pets", "kind": "expense", "color": "#000000", "icon": "paw"}), 200)
	if up.Name != "Pets" {
		t.Fatalf("update %+v", up)
	}
	if r := h.do("PUT", fmt.Sprintf("/api/v1/categories/%d", c.ID), tok, M{"name": "Pets", "kind": "income"}); r.Code != 422 {
		t.Fatalf("kind change allowed: %d", r.Code)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d", c.ID), tok, nil); r.Code != 204 {
		t.Fatalf("delete unused: %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d", c.ID), tok, nil); r.Code != 404 {
		t.Fatalf("delete twice: %d", r.Code)
	}
}

func TestDeleteCategoryInUse(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("use@example.com")
	food, other, salary := h.catID(tok, "Comida"), h.catID(tok, "Otros"), h.catID(tok, "Salario")
	var uid int64
	ctx := context.Background()
	_ = h.pool.QueryRow(ctx, "SELECT user_id FROM categories WHERE id=$1", food).Scan(&uid)
	if _, err := h.pool.Exec(ctx, "INSERT INTO expenses (user_id,category_id,amount,spent_on) VALUES ($1,$2,500,'2026-03-01')", uid, food); err != nil {
		t.Fatal(err)
	}

	r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d", food), tok, nil)
	if r.Code != 409 || errCode(r) != "category_in_use" {
		t.Fatalf("in use: %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d?reassign_to=%d", food, salary), tok, nil); r.Code != 422 {
		t.Fatalf("reassign to income kind: %d", r.Code)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d?reassign_to=%d", food, food), tok, nil); r.Code != 422 {
		t.Fatalf("reassign to self: %d", r.Code)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d?reassign_to=%d", food, other), tok, nil); r.Code != 204 {
		t.Fatalf("reassign: %d %s", r.Code, r.Body)
	}
	var now int64
	_ = h.pool.QueryRow(ctx, "SELECT category_id FROM expenses WHERE user_id=$1", uid).Scan(&now)
	if now != other {
		t.Fatalf("expense category = %d, want %d", now, other)
	}
}
