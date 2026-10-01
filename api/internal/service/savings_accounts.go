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

var accountKinds = []string{"bank", "sofipo", "fund", "government", "broker", "afore", "ppr", "crypto", "other"}

type SavingsAccount struct {
	ID              int64       `json:"id" validate:"required"`
	Name            string      `json:"name" validate:"required"`
	Institution     string      `json:"institution" validate:"required"`
	Kind            string      `json:"kind" validate:"required"`
	Color           string      `json:"color" validate:"required"`
	AnnualRateBP    *int32      `json:"annual_rate_bp"`
	OpeningBalance  int64       `json:"opening_balance" validate:"required"`
	OpeningDate     datex.Date  `json:"opening_date" validate:"required"`
	ArchivedOn      *datex.Date `json:"archived_on"`
	Balance         int64       `json:"balance" validate:"required"`
	PutIn           int64       `json:"put_in" validate:"required"`
	Gain            int64       `json:"gain" validate:"required"`
	GainPct         *float64    `json:"gain_pct"`
	EstimatedYield  *int64      `json:"estimated_yield"`
	AnchorDate      datex.Date  `json:"anchor_date" validate:"required"`
	Stale           bool        `json:"stale" validate:"required"`
	Insured         bool        `json:"insured" validate:"required"`
	HasHistory      bool        `json:"has_history" validate:"required"`
	HasMoneyHistory bool        `json:"has_money_history" validate:"required"`
}

type SavingsAccountInput struct {
	Name           string     `json:"name" validate:"required"`
	Institution    string     `json:"institution" validate:"required"`
	Kind           string     `json:"kind" validate:"required"`
	Color          string     `json:"color"`
	AnnualRateBP   *int32     `json:"annual_rate_bp"`
	OpeningBalance int64      `json:"opening_balance"`
	OpeningDate    datex.Date `json:"opening_date" validate:"required"`
	Archived       bool       `json:"archived"`
}

type SavingsAccountDetail struct {
	Account SavingsAccount `json:"account" validate:"required"`
	Goals   []SavingsGoal  `json:"goals" validate:"required"`
}

type AccountValuation struct {
	ValuedOn datex.Date `json:"valued_on" validate:"required"`
	Value    int64      `json:"value" validate:"required"`
}

type ValuationInput struct {
	Value int64 `json:"value" validate:"required"`
}

func (d savingsData) accountView(a store.SavingsAccount, today time.Time) SavingsAccount {
	st := savings.AccountStats(mathAccount(a), d.vals[a.ID], d.moves, today)
	return SavingsAccount{
		ID: a.ID, Name: a.Name, Institution: a.Institution, Kind: a.Kind, Color: a.Color, AnnualRateBP: a.AnnualRateBp,
		OpeningBalance: a.OpeningBalance, OpeningDate: datex.NewDate(a.OpeningDate), ArchivedOn: datex.DatePtr(a.ArchivedOn),
		Balance: st.Balance, PutIn: st.PutIn, Gain: st.Gain, GainPct: st.GainPct, EstimatedYield: st.EstimatedYield,
		AnchorDate: datex.NewDate(st.AnchorDate), Stale: st.Stale, Insured: savings.InsuredUDIs(a.Kind) > 0,
		HasHistory: d.hasHistory(a.ID), HasMoneyHistory: d.hasMoneyHistory(a.ID),
	}
}

func validateSavingsAccount(in *SavingsAccountInput, today time.Time) error {
	in.Name, in.Institution = strings.TrimSpace(in.Name), strings.Join(strings.Fields(in.Institution), " ")
	if in.Color == "" {
		in.Color = "#64748b"
	}
	var v apperr.V
	n := utf8.RuneCountInString(in.Name)
	v.Check(n >= 1 && n <= 60, "name", "must be 1-60 characters")
	n = utf8.RuneCountInString(in.Institution)
	v.Check(n >= 1 && n <= 60, "institution", "must be 1-60 characters")
	v.Check(slices.Contains(accountKinds, in.Kind), "kind", "is not a valid account kind")
	v.Check(colorRe.MatchString(in.Color), "color", "must be a hex color such as #22c55e")
	v.Check(in.AnnualRateBP == nil || (*in.AnnualRateBP >= 0 && *in.AnnualRateBP <= 10000), "annual_rate_bp", "must be between 0 and 10000")
	v.Check(in.OpeningBalance >= 0 && in.OpeningBalance < maxAmount, "opening_balance", "must be between 0 and 999999999999 cents")
	v.Check(!in.OpeningDate.IsZero(), "opening_date", "is required")
	v.Check(!in.OpeningDate.After(today), "opening_date", "must not be in the future")
	return v.Err()
}

func accountExists() error {
	return apperr.Conflict("savings_account_exists", "an account with that name already exists")
}

func (s *Service) accountByID(ctx context.Context, a Actor, id int64) (SavingsAccount, error) {
	d, err := s.loadSavings(ctx, s.q, a.UserID)
	if err != nil {
		return SavingsAccount{}, err
	}
	acc, ok := d.account(id)
	if !ok {
		return SavingsAccount{}, apperr.NotFound()
	}
	return d.accountView(acc, s.today(a)), nil
}

func (s *Service) ListSavingsAccounts(ctx context.Context, a Actor, includeArchived bool) ([]SavingsAccount, error) {
	d, err := s.loadSavings(ctx, s.q, a.UserID)
	if err != nil {
		return nil, err
	}
	today := s.today(a)
	out := []SavingsAccount{}
	for _, acc := range d.accounts {
		if acc.ArchivedOn == nil || includeArchived {
			out = append(out, d.accountView(acc, today))
		}
	}
	return out, nil
}

func (s *Service) GetSavingsAccount(ctx context.Context, a Actor, id int64) (SavingsAccountDetail, error) {
	d, err := s.loadSavings(ctx, s.q, a.UserID)
	if err != nil {
		return SavingsAccountDetail{}, err
	}
	acc, ok := d.account(id)
	if !ok {
		return SavingsAccountDetail{}, apperr.NotFound()
	}
	today := s.today(a)
	out := SavingsAccountDetail{Account: d.accountView(acc, today), Goals: []SavingsGoal{}}
	for _, g := range d.goals {
		if g.AccountID == id {
			out.Goals = append(out.Goals, d.goalView(g, today))
		}
	}
	return out, nil
}

func (s *Service) CreateSavingsAccount(ctx context.Context, a Actor, in SavingsAccountInput) (SavingsAccount, error) {
	if err := validateSavingsAccount(&in, s.today(a)); err != nil {
		return SavingsAccount{}, err
	}
	acc, err := s.q.CreateSavingsAccount(ctx, store.CreateSavingsAccountParams{UserID: a.UserID, Name: in.Name,
		Institution: in.Institution, Kind: in.Kind, Color: in.Color, AnnualRateBp: in.AnnualRateBP,
		OpeningBalance: in.OpeningBalance, OpeningDate: in.OpeningDate.Time})
	if isUnique(err) {
		return SavingsAccount{}, accountExists()
	}
	if err != nil {
		return SavingsAccount{}, err
	}
	return s.accountByID(ctx, a, acc.ID)
}

func (s *Service) UpdateSavingsAccount(ctx context.Context, a Actor, id int64, in SavingsAccountInput) (SavingsAccount, error) {
	today := s.today(a)
	if err := validateSavingsAccount(&in, today); err != nil {
		return SavingsAccount{}, err
	}
	err := s.inTx(ctx, func(q *store.Queries) error {
		d, err := s.loadSavings(ctx, q, a.UserID)
		if err != nil {
			return err
		}
		cur, ok := d.account(id)
		if !ok {
			return apperr.NotFound()
		}
		if d.hasMoneyHistory(id) && (in.OpeningBalance != cur.OpeningBalance || !in.OpeningDate.Equal(cur.OpeningDate)) {
			return apperr.Validation(map[string]string{"opening_balance": "cannot change after the account has movements or valuations"})
		}
		archivedOn := cur.ArchivedOn
		if in.Archived && archivedOn == nil {
			archivedOn = &today
		} else if !in.Archived {
			archivedOn = nil
		}
		_, err = q.UpdateSavingsAccount(ctx, store.UpdateSavingsAccountParams{Name: in.Name, Institution: in.Institution,
			Kind: in.Kind, Color: in.Color, AnnualRateBp: in.AnnualRateBP, OpeningBalance: in.OpeningBalance,
			OpeningDate: in.OpeningDate.Time, ArchivedOn: archivedOn, ID: id, UserID: a.UserID})
		if isUnique(err) {
			return accountExists()
		}
		if err != nil {
			return err
		}
		if cur.ArchivedOn == nil && archivedOn != nil { // an archived account's goals stop planning too
			if err := q.ArchiveGoalsOfAccount(ctx, store.ArchiveGoalsOfAccountParams{UserID: a.UserID, AccountID: id}); err != nil {
				return err
			}
		}
		return s.syncAchieved(ctx, q, a, id) // the opening may have changed the balance
	})
	if err != nil {
		return SavingsAccount{}, err
	}
	return s.accountByID(ctx, a, id)
}

func (s *Service) DeleteSavingsAccount(ctx context.Context, a Actor, id int64) error {
	return s.inTx(ctx, func(q *store.Queries) error {
		d, err := s.loadSavings(ctx, q, a.UserID)
		if err != nil {
			return err
		}
		if _, ok := d.account(id); !ok {
			return apperr.NotFound()
		}
		if d.hasHistory(id) {
			return apperr.Conflict("account_has_history", "the account has movements, valuations or goals; archive it instead")
		}
		_, err = q.DeleteSavingsAccount(ctx, store.DeleteSavingsAccountParams{ID: id, UserID: a.UserID})
		return err
	})
}

func (s *Service) ListValuations(ctx context.Context, a Actor, accountID int64) ([]AccountValuation, error) {
	if _, err := s.q.GetSavingsAccount(ctx, store.GetSavingsAccountParams{ID: accountID, UserID: a.UserID}); err != nil {
		return nil, notFound(err)
	}
	rows, err := s.q.ListAccountValuationsForAccount(ctx, store.ListAccountValuationsForAccountParams{UserID: a.UserID, AccountID: accountID})
	if err != nil {
		return nil, err
	}
	out := make([]AccountValuation, len(rows))
	for i, r := range rows {
		out[i] = AccountValuation{ValuedOn: datex.NewDate(r.ValuedOn), Value: r.Value}
	}
	return out, nil
}

func (s *Service) PutValuation(ctx context.Context, a Actor, accountID int64, on time.Time, value int64) (AccountValuation, error) {
	today := s.today(a)
	var out AccountValuation
	err := s.inTx(ctx, func(q *store.Queries) error {
		acc, err := q.GetSavingsAccount(ctx, store.GetSavingsAccountParams{ID: accountID, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		var v apperr.V
		v.Check(value >= 0 && value < maxAmount, "value", "must be between 0 and 999999999999 cents")
		v.Check(!on.After(today), "valued_on", "must not be in the future")
		v.Check(!on.Before(acc.OpeningDate), "valued_on", "must not be before the account's opening date")
		if err := v.Err(); err != nil {
			return err
		}
		r, err := q.UpsertAccountValuation(ctx, store.UpsertAccountValuationParams{UserID: a.UserID, AccountID: accountID, Value: value, ValuedOn: on})
		if err != nil {
			return err
		}
		out = AccountValuation{ValuedOn: datex.NewDate(r.ValuedOn), Value: r.Value}
		return s.syncAchieved(ctx, q, a, accountID)
	})
	return out, err
}

func (s *Service) DeleteValuation(ctx context.Context, a Actor, accountID int64, on time.Time) error {
	return s.inTx(ctx, func(q *store.Queries) error {
		n, err := q.DeleteAccountValuation(ctx, store.DeleteAccountValuationParams{UserID: a.UserID, AccountID: accountID, ValuedOn: on})
		if err != nil {
			return err
		}
		if n == 0 {
			return apperr.NotFound()
		}
		return s.settle(ctx, q, a, accountID) // later withdrawals may have relied on the value
	})
}
