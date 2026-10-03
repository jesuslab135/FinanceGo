package apperr

import (
	"errors"
	"testing"
)

func TestValidator(t *testing.T) {
	var v V
	v.Check(true, "a", "never")
	if v.Err() != nil {
		t.Fatal("no failures should give nil error")
	}
	v.Check(false, "amount", "must be > 0")
	v.Check(false, "amount", "second message ignored")
	v.Check(false, "name", "required")
	var e *Error
	if !errors.As(v.Err(), &e) || e.Status != 422 || e.Code != "validation_failed" {
		t.Fatalf("got %#v", v.Err())
	}
	if e.Fields["amount"] != "must be > 0" || e.Fields["name"] != "required" {
		t.Fatalf("fields=%v", e.Fields)
	}
}

func TestConstructors(t *testing.T) {
	if NotFound().Status != 404 || Unauthorized().Status != 401 || Conflict("x", "y").Status != 409 ||
		InvalidReference("category_id").Fields["category_id"] == "" || RateLimited().Status != 429 ||
		MonthOutOfRange().Code != "month_out_of_range" || BadRequest("m").Status != 400 {
		t.Fatal("constructor mismatch")
	}
}

func TestInsufficientBalance(t *testing.T) {
	e := InsufficientBalance()
	if e.Status != 422 || e.Code != "insufficient_balance" || e.Fields["amount"] != "exceeds the account balance" {
		t.Fatalf("%+v", e)
	}
}
