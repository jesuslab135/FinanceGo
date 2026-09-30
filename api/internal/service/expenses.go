package service

import (
	"context"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/store"
)

type Expense struct {
	ID              int64      `json:"id" validate:"required"`
	CategoryID      int64      `json:"category_id" validate:"required"`
	PaymentMethodID *int64     `json:"payment_method_id"`
	Amount          int64      `json:"amount" validate:"required"`
	Description     string     `json:"description" validate:"required"`
	SpentOn         datex.Date `json:"spent_on" validate:"required"`
	CreatedAt       time.Time  `json:"created_at" validate:"required"`
}

type ExpenseInput struct {
	CategoryID      int64      `json:"category_id" validate:"required"`
	PaymentMethodID *int64     `json:"payment_method_id"`
	Amount          int64      `json:"amount" validate:"required"`
	Description     string     `json:"description" validate:"required"`
	SpentOn         datex.Date `json:"spent_on" validate:"required"`
}

type ExpenseFilter struct {
	From, To                    *time.Time
	CategoryID, PaymentMethodID *int64
	Q, Cursor                   string
	Limit                       int
}

type ExpensePage struct {
	Items      []Expense `json:"items" validate:"required"`
	NextCursor *string   `json:"next_cursor"`
}

func toExpense(e store.Expense) Expense {
	return Expense{ID: e.ID, CategoryID: e.CategoryID, PaymentMethodID: e.PaymentMethodID, Amount: e.Amount,
		Description: e.Description, SpentOn: datex.NewDate(e.SpentOn), CreatedAt: e.CreatedAt}
}

func (s *Service) validateExpense(ctx context.Context, q *store.Queries, a Actor, in *ExpenseInput) error {
	in.Description = strings.TrimSpace(in.Description)
	var v apperr.V
	checkAmount(&v, "amount", in.Amount)
	v.Check(utf8.RuneCountInString(in.Description) <= 200, "description", "must be at most 200 characters")
	v.Check(!in.SpentOn.IsZero(), "spent_on", "is required")
	v.Check(in.CategoryID > 0, "category_id", "is required")
	if err := v.Err(); err != nil {
		return err
	}
	if err := s.checkCategoryRef(ctx, q, a.UserID, in.CategoryID, "expense", "category_id"); err != nil {
		return err
	}
	_, err := s.checkPaymentMethodRef(ctx, q, a.UserID, in.PaymentMethodID, "payment_method_id", false)
	return err
}

func (s *Service) CreateExpense(ctx context.Context, a Actor, in ExpenseInput) (Expense, error) {
	if err := s.validateExpense(ctx, s.q, a, &in); err != nil {
		return Expense{}, err
	}
	e, err := s.q.CreateExpense(ctx, store.CreateExpenseParams{UserID: a.UserID, CategoryID: in.CategoryID,
		PaymentMethodID: in.PaymentMethodID, Amount: in.Amount, Description: in.Description, SpentOn: in.SpentOn.Time})
	if err != nil {
		return Expense{}, err
	}
	return toExpense(e), nil
}

func (s *Service) UpdateExpense(ctx context.Context, a Actor, id int64, in ExpenseInput) (Expense, error) {
	if err := s.validateExpense(ctx, s.q, a, &in); err != nil {
		return Expense{}, err
	}
	e, err := s.q.UpdateExpense(ctx, store.UpdateExpenseParams{ID: id, UserID: a.UserID, CategoryID: in.CategoryID,
		PaymentMethodID: in.PaymentMethodID, Amount: in.Amount, Description: in.Description, SpentOn: in.SpentOn.Time})
	if err != nil {
		return Expense{}, notFound(err)
	}
	return toExpense(e), nil
}

func (s *Service) DeleteExpense(ctx context.Context, a Actor, id int64) error {
	n, err := s.q.DeleteExpense(ctx, store.DeleteExpenseParams{ID: id, UserID: a.UserID})
	if err != nil {
		return err
	}
	if n == 0 {
		return apperr.NotFound()
	}
	return nil
}

func encodeCursor(e store.Expense) string {
	return base64.RawURLEncoding.EncodeToString([]byte(e.SpentOn.Format(time.DateOnly) + "|" + strconv.FormatInt(e.ID, 10)))
}

func decodeCursor(c string) (*time.Time, *int64, error) {
	b, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return nil, nil, err
	}
	date, idStr, ok := strings.Cut(string(b), "|")
	if !ok {
		return nil, nil, fmt.Errorf("bad cursor")
	}
	d, err := datex.ParseDate(date)
	if err != nil {
		return nil, nil, err
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return nil, nil, err
	}
	return &d, &id, nil
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func (s *Service) ListExpenses(ctx context.Context, a Actor, f ExpenseFilter) (ExpensePage, error) {
	if f.Limit <= 0 {
		f.Limit = 50
	}
	f.Limit = min(f.Limit, 200)
	p := store.ListExpensesParams{UserID: a.UserID, FromDate: f.From, ToDate: f.To, CategoryID: f.CategoryID,
		PaymentMethodID: f.PaymentMethodID, Lim: int32(f.Limit + 1)}
	if q := strings.TrimSpace(f.Q); q != "" {
		esc := likeEscaper.Replace(q)
		p.Q = &esc
	}
	if f.Cursor != "" {
		d, id, err := decodeCursor(f.Cursor)
		if err != nil {
			return ExpensePage{}, apperr.BadRequest("invalid cursor")
		}
		p.CursorDate, p.CursorID = d, id
	}
	rows, err := s.q.ListExpenses(ctx, p)
	if err != nil {
		return ExpensePage{}, err
	}
	page := ExpensePage{Items: []Expense{}}
	for i, r := range rows {
		if i == f.Limit {
			c := encodeCursor(rows[i-1])
			page.NextCursor = &c
			break
		}
		page.Items = append(page.Items, toExpense(r))
	}
	return page, nil
}
