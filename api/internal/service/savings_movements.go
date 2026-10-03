package service

import (
	"context"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/savings"
	"financego/internal/store"
)

var movementKinds = []string{savings.KindDeposit, savings.KindWithdrawal, savings.KindTransfer}

type AccountMovement struct {
	ID          int64      `json:"id" validate:"required"`
	AccountID   int64      `json:"account_id" validate:"required"`
	Kind        string     `json:"kind" validate:"required" enums:"deposit,withdrawal,transfer"`
	ToAccountID *int64     `json:"to_account_id"`
	GoalID      *int64     `json:"goal_id"`
	Amount      int64      `json:"amount" validate:"required"`
	OccurredOn  datex.Date `json:"occurred_on" validate:"required"`
	Note        string     `json:"note" validate:"required"`
	CreatedAt   time.Time  `json:"created_at" validate:"required"`
}

type AccountMovementInput struct {
	AccountID   int64      `json:"account_id" validate:"required"`
	Kind        string     `json:"kind" validate:"required" enums:"deposit,withdrawal,transfer"`
	ToAccountID *int64     `json:"to_account_id"`
	GoalID      *int64     `json:"goal_id"`
	Amount      int64      `json:"amount" validate:"required"`
	OccurredOn  datex.Date `json:"occurred_on" validate:"required"`
	Note        string     `json:"note"`
}

func toAccountMovement(m store.AccountMovement) AccountMovement {
	return AccountMovement{ID: m.ID, AccountID: m.AccountID, Kind: m.Kind, ToAccountID: m.ToAccountID, GoalID: m.GoalID,
		Amount: m.Amount, OccurredOn: datex.NewDate(m.OccurredOn), Note: m.Note, CreatedAt: m.CreatedAt}
}

// touched lists the accounts a movement affects (its account, and the destination of a transfer).
func touched(account int64, to *int64) []int64 {
	if to == nil {
		return []int64{account}
	}
	return []int64{account, *to}
}

// validateMovement checks `in` against the user's savings data. editingID (0 on create) is left out
// of the balance check, so an edit is compared with the balance before its old amount.
func validateMovement(d savingsData, in *AccountMovementInput, today time.Time, editingID int64) error {
	in.Note = strings.TrimSpace(in.Note)
	var v apperr.V
	v.Check(slices.Contains(movementKinds, in.Kind), "kind", "is not a valid movement kind")
	checkAmount(&v, "amount", in.Amount)
	v.Check(!in.OccurredOn.IsZero(), "occurred_on", "is required")
	v.Check(!in.OccurredOn.After(today), "occurred_on", "must not be in the future")
	v.Check(utf8.RuneCountInString(in.Note) <= 200, "note", "must be at most 200 characters")
	v.Check(in.AccountID > 0, "account_id", "is required")
	transfer := in.Kind == savings.KindTransfer
	v.Check(!transfer || in.ToAccountID != nil, "to_account_id", "is required")
	v.Check(transfer || in.ToAccountID == nil, "to_account_id", "is only for transfers")
	v.Check(!transfer || in.GoalID == nil, "goal_id", "is not allowed on transfers")
	if err := v.Err(); err != nil {
		return err
	}

	acc, ok := d.account(in.AccountID)
	if !ok {
		return apperr.InvalidReference("account_id")
	}
	v.Check(acc.ArchivedOn == nil, "account_id", "is archived")
	v.Check(!in.OccurredOn.Before(acc.OpeningDate), "occurred_on", "must not be before the account's opening date")
	if transfer {
		to, ok := d.account(*in.ToAccountID)
		if !ok {
			return apperr.InvalidReference("to_account_id")
		}
		v.Check(to.ID != acc.ID, "to_account_id", "must differ from account_id")
		v.Check(to.ArchivedOn == nil, "to_account_id", "is archived")
		v.Check(!in.OccurredOn.Before(to.OpeningDate), "occurred_on", "must not be before the account's opening date")
	}
	if in.GoalID != nil {
		g, ok := d.goal(*in.GoalID)
		if !ok {
			return apperr.InvalidReference("goal_id")
		}
		v.Check(g.AccountID == acc.ID, "goal_id", "belongs to another account")
	}
	if err := v.Err(); err != nil {
		return err
	}
	if in.Kind != savings.KindDeposit && in.Amount > d.without(editingID).balance(acc.ID, today) {
		return apperr.InsufficientBalance()
	}
	return nil
}

func (s *Service) ListAccountMovements(ctx context.Context, a Actor, accountID int64, from, to *time.Time) ([]AccountMovement, error) {
	if _, err := s.q.GetSavingsAccount(ctx, store.GetSavingsAccountParams{ID: accountID, UserID: a.UserID}); err != nil {
		return nil, notFound(err)
	}
	rows, err := s.q.ListAccountMovementsForAccount(ctx, store.ListAccountMovementsForAccountParams{
		UserID: a.UserID, AccountID: accountID, FromDate: from, ToDate: to})
	if err != nil {
		return nil, err
	}
	out := make([]AccountMovement, len(rows))
	for i, r := range rows {
		out[i] = toAccountMovement(r)
	}
	return out, nil
}

func (s *Service) CreateAccountMovement(ctx context.Context, a Actor, in AccountMovementInput) (AccountMovement, error) {
	today := s.today(a)
	var out store.AccountMovement
	err := s.inTx(ctx, func(q *store.Queries) error {
		d, err := s.loadSavings(ctx, q, a.UserID)
		if err != nil {
			return err
		}
		if err := validateMovement(d, &in, today, 0); err != nil {
			return err
		}
		if out, err = q.CreateAccountMovement(ctx, store.CreateAccountMovementParams{UserID: a.UserID, AccountID: in.AccountID,
			Kind: in.Kind, ToAccountID: in.ToAccountID, GoalID: in.GoalID, Amount: in.Amount, OccurredOn: in.OccurredOn.Time,
			Note: in.Note}); err != nil {
			return err
		}
		return s.syncAchieved(ctx, q, a, touched(in.AccountID, in.ToAccountID)...)
	})
	if err != nil {
		return AccountMovement{}, err
	}
	return toAccountMovement(out), nil
}

func (s *Service) UpdateAccountMovement(ctx context.Context, a Actor, id int64, in AccountMovementInput) (AccountMovement, error) {
	today := s.today(a)
	var out store.AccountMovement
	err := s.inTx(ctx, func(q *store.Queries) error {
		cur, err := q.GetAccountMovement(ctx, store.GetAccountMovementParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		d, err := s.loadSavings(ctx, q, a.UserID)
		if err != nil {
			return err
		}
		if err := validateMovement(d, &in, today, id); err != nil {
			return err
		}
		if out, err = q.UpdateAccountMovement(ctx, store.UpdateAccountMovementParams{AccountID: in.AccountID, Kind: in.Kind,
			ToAccountID: in.ToAccountID, GoalID: in.GoalID, Amount: in.Amount, OccurredOn: in.OccurredOn.Time, Note: in.Note,
			ID: id, UserID: a.UserID}); err != nil {
			return err
		}
		ids := append(touched(cur.AccountID, cur.ToAccountID), touched(in.AccountID, in.ToAccountID)...)
		return s.settle(ctx, q, a, ids...) // lowering or moving money away can overdraw an account
	})
	if err != nil {
		return AccountMovement{}, err
	}
	return toAccountMovement(out), nil
}

func (s *Service) DeleteAccountMovement(ctx context.Context, a Actor, id int64) error {
	return s.inTx(ctx, func(q *store.Queries) error {
		cur, err := q.GetAccountMovement(ctx, store.GetAccountMovementParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		if _, err := q.DeleteAccountMovement(ctx, store.DeleteAccountMovementParams{ID: id, UserID: a.UserID}); err != nil {
			return err
		}
		return s.settle(ctx, q, a, touched(cur.AccountID, cur.ToAccountID)...)
	})
}
