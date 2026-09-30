package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/store"
)

type PaymentMethod struct {
	ID                 int64       `json:"id"`
	Nickname           string      `json:"nickname"`
	Type               string      `json:"type"`
	Bank               *string     `json:"bank"`
	Network            *string     `json:"network"`
	Last4              *string     `json:"last4"`
	Color              string      `json:"color"`
	Active             bool        `json:"active"`
	CreditLimit        *int64      `json:"credit_limit"`
	StatementDay       *int32      `json:"statement_day"`
	PaymentDueDay      *int32      `json:"payment_due_day"`
	OpeningBalance     int64       `json:"opening_balance"`
	OpeningBalanceDate *datex.Date `json:"opening_balance_date"`
}

type PaymentMethodInput struct {
	Nickname           string      `json:"nickname"`
	Type               string      `json:"type"`
	Bank               *string     `json:"bank"`
	Network            *string     `json:"network"`
	Last4              *string     `json:"last4"`
	Color              string      `json:"color"`
	Active             *bool       `json:"active"`
	CreditLimit        *int64      `json:"credit_limit"`
	StatementDay       *int32      `json:"statement_day"`
	PaymentDueDay      *int32      `json:"payment_due_day"`
	OpeningBalance     int64       `json:"opening_balance"`
	OpeningBalanceDate *datex.Date `json:"opening_balance_date"`
}

var last4Re = regexp.MustCompile(`^[0-9]{4}$`)

func toPaymentMethod(p store.PaymentMethod) PaymentMethod {
	return PaymentMethod{
		ID: p.ID, Nickname: p.Nickname, Type: p.Type, Bank: p.Bank, Network: p.Network, Last4: p.Last4,
		Color: p.Color, Active: p.Active, CreditLimit: p.CreditLimit, StatementDay: p.StatementDay,
		PaymentDueDay: p.PaymentDueDay, OpeningBalance: p.OpeningBalance, OpeningBalanceDate: datex.DatePtr(p.OpeningBalanceDate),
	}
}

func blankToNil(p *string) *string {
	if p == nil {
		return nil
	}
	t := strings.TrimSpace(*p)
	if t == "" {
		return nil
	}
	return &t
}

func dayOK(d *int32) bool { return d != nil && *d >= 1 && *d <= 31 }

// normalizePaymentMethod validates the input and fills defaults. today is used
// as the default opening_balance_date for credit cards.
func normalizePaymentMethod(in *PaymentMethodInput, today time.Time) error {
	in.Nickname = strings.TrimSpace(in.Nickname)
	in.Bank, in.Network, in.Last4 = blankToNil(in.Bank), blankToNil(in.Network), blankToNil(in.Last4)
	if in.Color == "" {
		in.Color = "#64748b"
	}
	if in.Active == nil {
		t := true
		in.Active = &t
	}
	var v apperr.V
	n := utf8.RuneCountInString(in.Nickname)
	v.Check(n >= 1 && n <= 60, "nickname", "must be 1-60 characters")
	v.Check(!hasCardNumber(in.Nickname), "nickname", "must not contain a card number")
	v.Check(in.Type == "credit" || in.Type == "debit" || in.Type == "cash" || in.Type == "transfer", "type", "must be credit, debit, cash or transfer")
	v.Check(in.Bank == nil || (utf8.RuneCountInString(*in.Bank) <= 60 && !hasCardNumber(*in.Bank)), "bank", "must be at most 60 characters and contain no card number")
	v.Check(in.Network == nil || *in.Network == "visa" || *in.Network == "mastercard" || *in.Network == "amex" || *in.Network == "other", "network", "must be visa, mastercard, amex or other")
	v.Check(in.Last4 == nil || last4Re.MatchString(*in.Last4), "last4", "must be exactly 4 digits")
	v.Check(colorRe.MatchString(in.Color), "color", "must be a hex color such as #22c55e")
	if in.Type == "credit" {
		v.Check(dayOK(in.StatementDay), "statement_day", "is required for credit cards (1-31)")
		v.Check(dayOK(in.PaymentDueDay), "payment_due_day", "is required for credit cards (1-31)")
		if in.CreditLimit != nil {
			checkAmount(&v, "credit_limit", *in.CreditLimit)
		}
		v.Check(in.OpeningBalance >= 0 && in.OpeningBalance < maxAmount, "opening_balance", "must be between 0 and 999999999999 cents")
		if in.OpeningBalanceDate == nil {
			d := datex.NewDate(today)
			in.OpeningBalanceDate = &d
		}
	} else {
		v.Check(in.StatementDay == nil, "statement_day", "only allowed for credit cards")
		v.Check(in.PaymentDueDay == nil, "payment_due_day", "only allowed for credit cards")
		v.Check(in.CreditLimit == nil, "credit_limit", "only allowed for credit cards")
		v.Check(in.OpeningBalance == 0, "opening_balance", "only allowed for credit cards")
		in.OpeningBalanceDate = nil
	}
	return v.Err()
}

func dateOrNil(d *datex.Date) *time.Time {
	if d == nil {
		return nil
	}
	t := d.Time
	return &t
}

func (s *Service) ListPaymentMethods(ctx context.Context, a Actor) ([]PaymentMethod, error) {
	rows, err := s.q.ListPaymentMethods(ctx, a.UserID)
	if err != nil {
		return nil, err
	}
	out := make([]PaymentMethod, len(rows))
	for i, r := range rows {
		out[i] = toPaymentMethod(r)
	}
	return out, nil
}

func (s *Service) GetPaymentMethod(ctx context.Context, a Actor, id int64) (PaymentMethod, error) {
	p, err := s.q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: id, UserID: a.UserID})
	if err != nil {
		return PaymentMethod{}, notFound(err)
	}
	return toPaymentMethod(p), nil
}

func (s *Service) CreatePaymentMethod(ctx context.Context, a Actor, in PaymentMethodInput) (PaymentMethod, error) {
	if err := normalizePaymentMethod(&in, s.today(a)); err != nil {
		return PaymentMethod{}, err
	}
	p, err := s.q.CreatePaymentMethod(ctx, store.CreatePaymentMethodParams{
		UserID: a.UserID, Nickname: in.Nickname, Type: in.Type, Bank: in.Bank, Network: in.Network, Last4: in.Last4,
		Color: in.Color, Active: *in.Active, CreditLimit: in.CreditLimit, StatementDay: in.StatementDay,
		PaymentDueDay: in.PaymentDueDay, OpeningBalance: in.OpeningBalance, OpeningBalanceDate: dateOrNil(in.OpeningBalanceDate),
	})
	if err != nil {
		return PaymentMethod{}, err
	}
	return toPaymentMethod(p), nil
}

func (s *Service) UpdatePaymentMethod(ctx context.Context, a Actor, id int64, in PaymentMethodInput) (PaymentMethod, error) {
	cur, err := s.q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: id, UserID: a.UserID})
	if err != nil {
		return PaymentMethod{}, notFound(err)
	}
	if in.Type != cur.Type {
		return PaymentMethod{}, apperr.Validation(map[string]string{"type": "cannot be changed"})
	}
	if err := normalizePaymentMethod(&in, s.today(a)); err != nil {
		return PaymentMethod{}, err
	}
	var out PaymentMethod
	err = s.inTx(ctx, func(q *store.Queries) error {
		p, err := q.UpdatePaymentMethod(ctx, store.UpdatePaymentMethodParams{
			ID: id, UserID: a.UserID, Nickname: in.Nickname, Bank: in.Bank, Network: in.Network, Last4: in.Last4,
			Color: in.Color, Active: *in.Active, CreditLimit: in.CreditLimit, StatementDay: in.StatementDay,
			PaymentDueDay: in.PaymentDueDay, OpeningBalance: in.OpeningBalance, OpeningBalanceDate: dateOrNil(in.OpeningBalanceDate),
		})
		if err != nil {
			return notFound(err)
		}
		out = toPaymentMethod(p)
		// A new cut-off or due day remaps installments to other months: drop the
		// pending rows so ensureInstallments regenerates them lazily.
		if cur.Type == "credit" && (!eqPtr(cur.StatementDay, p.StatementDay) || !eqPtr(cur.PaymentDueDay, p.PaymentDueDay)) {
			return q.DeleteCardPendingInstallments(ctx, store.DeleteCardPendingInstallmentsParams{UserID: a.UserID, PaymentMethodID: id})
		}
		return nil
	})
	return out, err
}

func (s *Service) DeletePaymentMethod(ctx context.Context, a Actor, id int64) error {
	return s.inTx(ctx, func(q *store.Queries) error {
		if _, err := q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: id, UserID: a.UserID}); err != nil {
			return notFound(err)
		}
		uses, err := q.PaymentMethodUsage(ctx, &id)
		if err != nil {
			return err
		}
		if uses > 0 {
			return apperr.Conflict("payment_method_in_use", fmt.Sprintf("payment method is used by %d records; deactivate it instead", uses))
		}
		_, err = q.DeletePaymentMethod(ctx, store.DeletePaymentMethodParams{ID: id, UserID: a.UserID})
		return err
	})
}
