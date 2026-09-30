package service

import (
	"context"
	"errors"
	"regexp"

	"github.com/jackc/pgx/v5"

	"financego/internal/apperr"
	"financego/internal/store"
)

const maxAmount int64 = 1_000_000_000_000

var (
	colorRe      = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	cardNumberRe = regexp.MustCompile(`\d(?:[ -]?\d){12,18}`)
)

func checkAmount(v *apperr.V, field string, amount int64) {
	v.Check(amount >= 1 && amount < maxAmount, field, "must be between 1 and 999999999999 cents")
}

// hasCardNumber reports whether s looks like it contains a full card number (13-19 digits).
func hasCardNumber(s string) bool { return cardNumberRe.MatchString(s) }

func eqPtr[T comparable](a, b *T) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// checkCategoryRef verifies the category belongs to the user (and has `kind` when non-empty).
func (s *Service) checkCategoryRef(ctx context.Context, q *store.Queries, userID, id int64, kind, field string) error {
	c, err := q.GetCategory(ctx, store.GetCategoryParams{ID: id, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.InvalidReference(field)
	}
	if err != nil {
		return err
	}
	if kind != "" && c.Kind != kind {
		return apperr.Validation(map[string]string{field: "must be an " + kind + " category"})
	}
	return nil
}

// checkPaymentMethodRef verifies an optional payment method belongs to the user.
func (s *Service) checkPaymentMethodRef(ctx context.Context, q *store.Queries, userID int64, id *int64, field string, creditOnly bool) (*store.PaymentMethod, error) {
	if id == nil {
		return nil, nil
	}
	pm, err := q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: *id, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.InvalidReference(field)
	}
	if err != nil {
		return nil, err
	}
	if creditOnly && pm.Type != "credit" {
		return nil, apperr.Validation(map[string]string{field: "must be a credit card"})
	}
	return &pm, nil
}
