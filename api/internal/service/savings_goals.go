package service

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/savings"
	"financego/internal/store"
)

type SavingsGoal struct {
	ID               int64       `json:"id" validate:"required"`
	AccountID        int64       `json:"account_id" validate:"required"`
	Name             string      `json:"name" validate:"required"`
	Kind             string      `json:"kind" validate:"required"`
	EmergencyMonths  *int32      `json:"emergency_months"`
	TargetAmount     int64       `json:"target_amount" validate:"required"`
	StartingAmount   int64       `json:"starting_amount" validate:"required"`
	TargetDate       *datex.Date `json:"target_date"`
	MonthlyAmount    *int64      `json:"monthly_amount"`
	Color            string      `json:"color" validate:"required"`
	Icon             string      `json:"icon" validate:"required"`
	StartMonth       datex.Month `json:"start_month" validate:"required"`
	AchievedOn       *datex.Date `json:"achieved_on"`
	Archived         bool        `json:"archived" validate:"required"`
	Progress         int64       `json:"progress" validate:"required"`
	Remaining        int64       `json:"remaining" validate:"required"`
	Pct              int32       `json:"pct" validate:"required"`
	RequiredMonthly  *int64      `json:"required_monthly"`
	Status           string      `json:"status" validate:"required" enums:"achieved,no_date,ahead,on_track,behind"`
	BehindBy         *int64      `json:"behind_by"`
	PlannedThisMonth int64       `json:"planned_this_month" validate:"required"`
}

func (d savingsData) goalView(g store.SavingsGoal, today time.Time) SavingsGoal {
	mg := mathGoal(g)
	st := savings.GoalStatsFor(mg, savings.GoalProgress(mg, d.moves, nil), d.balance(g.AccountID, today), today)
	return SavingsGoal{
		ID: g.ID, AccountID: g.AccountID, Name: g.Name, Kind: g.Kind, EmergencyMonths: g.EmergencyMonths,
		TargetAmount: g.TargetAmount, StartingAmount: g.StartingAmount, TargetDate: datex.DatePtr(g.TargetDate), MonthlyAmount: g.MonthlyAmount,
		Color: g.Color, Icon: g.Icon, StartMonth: datex.NewMonth(g.StartMonth), AchievedOn: datex.DatePtr(g.AchievedOn),
		Archived: g.Archived, Progress: st.Progress, Remaining: st.Remaining, Pct: st.Pct,
		RequiredMonthly: st.RequiredMonthly, Status: st.Status, BehindBy: st.BehindBy,
		PlannedThisMonth: savings.PlannedFor(mg, d.moves, datex.MonthStart(today)),
	}
}

var goalKinds = []string{"standard", "emergency"}

type SavingsGoalInput struct {
	AccountID       int64       `json:"account_id" validate:"required"`
	Name            string      `json:"name" validate:"required"`
	Kind            string      `json:"kind"`
	EmergencyMonths *int32      `json:"emergency_months"`
	TargetAmount    int64       `json:"target_amount" validate:"required"`
	StartingAmount  int64       `json:"starting_amount"`
	TargetDate      *datex.Date `json:"target_date"`
	MonthlyAmount   *int64      `json:"monthly_amount"`
	Color           string      `json:"color"`
	Icon            string      `json:"icon"`
	Archived        bool        `json:"archived"`
}

type EmergencySuggestion struct {
	MonthlyNeed int64 `json:"monthly_need" validate:"required"`
	Months      int32 `json:"months" validate:"required"`
	Target      int64 `json:"target" validate:"required"`
}

// validateGoal checks the input. checkDate is false on an update that keeps the same target date,
// so a goal whose date has passed can still be edited.
func validateGoal(in *SavingsGoalInput, today time.Time, checkDate bool) error {
	in.Name = strings.TrimSpace(in.Name)
	if in.Kind == "" {
		in.Kind = "standard"
	}
	if in.Color == "" {
		in.Color = "#64748b"
	}
	if in.Icon == "" {
		in.Icon = "piggy-bank"
	}
	var v apperr.V
	n := utf8.RuneCountInString(in.Name)
	v.Check(n >= 1 && n <= 60, "name", "must be 1-60 characters")
	v.Check(slices.Contains(goalKinds, in.Kind), "kind", "is not a valid goal kind")
	v.Check(in.Kind != "emergency" || (in.EmergencyMonths != nil && (*in.EmergencyMonths == 3 || *in.EmergencyMonths == 6)), "emergency_months", "must be 3 or 6")
	v.Check(in.Kind == "emergency" || in.EmergencyMonths == nil, "emergency_months", "is only for emergency goals")
	checkAmount(&v, "target_amount", in.TargetAmount)
	v.Check(in.StartingAmount >= 0 && in.StartingAmount < maxAmount, "starting_amount", "must be between 0 and 999999999999 cents")
	if in.MonthlyAmount != nil {
		checkAmount(&v, "monthly_amount", *in.MonthlyAmount)
	}
	v.Check(!checkDate || in.TargetDate == nil || !in.TargetDate.Before(datex.MonthStart(today)), "target_date", "must not be in a past month")
	v.Check(colorRe.MatchString(in.Color), "color", "must be a hex color such as #22c55e")
	n = utf8.RuneCountInString(in.Icon)
	v.Check(n >= 1 && n <= 40, "icon", "must be 1-40 characters")
	v.Check(in.AccountID > 0, "account_id", "is required")
	return v.Err()
}

func datePtrTime(d *datex.Date) *time.Time {
	if d == nil {
		return nil
	}
	return &d.Time
}

func (s *Service) goalByID(ctx context.Context, a Actor, id int64) (SavingsGoal, error) {
	d, err := s.loadSavings(ctx, s.q, a.UserID)
	if err != nil {
		return SavingsGoal{}, err
	}
	g, ok := d.goal(id)
	if !ok {
		return SavingsGoal{}, apperr.NotFound()
	}
	return d.goalView(g, s.today(a)), nil
}

func (s *Service) ListSavingsGoals(ctx context.Context, a Actor, includeArchived bool) ([]SavingsGoal, error) {
	d, err := s.loadSavings(ctx, s.q, a.UserID)
	if err != nil {
		return nil, err
	}
	today := s.today(a)
	out := []SavingsGoal{}
	for _, g := range d.goals {
		if !g.Archived || includeArchived {
			out = append(out, d.goalView(g, today))
		}
	}
	return out, nil
}

// goalAccount checks the goal's account belongs to the user and is not archived.
func goalAccount(ctx context.Context, q *store.Queries, a Actor, id int64) error {
	acc, err := q.GetSavingsAccount(ctx, store.GetSavingsAccountParams{ID: id, UserID: a.UserID})
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.InvalidReference("account_id")
	}
	if err != nil {
		return err
	}
	if acc.ArchivedOn != nil {
		return apperr.Validation(map[string]string{"account_id": "is archived"})
	}
	return nil
}

func (s *Service) CreateSavingsGoal(ctx context.Context, a Actor, in SavingsGoalInput) (SavingsGoal, error) {
	today := s.today(a)
	if err := validateGoal(&in, today, true); err != nil {
		return SavingsGoal{}, err
	}
	var id int64
	err := s.inTx(ctx, func(q *store.Queries) error {
		if err := goalAccount(ctx, q, a, in.AccountID); err != nil {
			return err
		}
		g, err := q.CreateSavingsGoal(ctx, store.CreateSavingsGoalParams{UserID: a.UserID, AccountID: in.AccountID,
			Name: in.Name, Kind: in.Kind, EmergencyMonths: in.EmergencyMonths, TargetAmount: in.TargetAmount, StartingAmount: in.StartingAmount,
			TargetDate: datePtrTime(in.TargetDate), MonthlyAmount: in.MonthlyAmount, Color: in.Color, Icon: in.Icon,
			StartMonth: datex.MonthStart(today)})
		if err != nil {
			return err
		}
		id = g.ID
		return s.syncAchieved(ctx, q, a, in.AccountID)
	})
	if err != nil {
		return SavingsGoal{}, err
	}
	return s.goalByID(ctx, a, id)
}

func (s *Service) UpdateSavingsGoal(ctx context.Context, a Actor, id int64, in SavingsGoalInput) (SavingsGoal, error) {
	today := s.today(a)
	err := s.inTx(ctx, func(q *store.Queries) error {
		cur, err := q.GetSavingsGoal(ctx, store.GetSavingsGoalParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		dateChanged := (in.TargetDate == nil) != (cur.TargetDate == nil) ||
			(in.TargetDate != nil && !in.TargetDate.Equal(*cur.TargetDate))
		if err := validateGoal(&in, today, dateChanged); err != nil {
			return err
		}
		if in.AccountID != cur.AccountID {
			return apperr.Validation(map[string]string{"account_id": "cannot be changed"})
		}
		if !in.Archived { // a goal stays archived while its account is
			if err := goalAccount(ctx, q, a, cur.AccountID); err != nil {
				return err
			}
		}
		if _, err := q.UpdateSavingsGoal(ctx, store.UpdateSavingsGoalParams{Name: in.Name, Kind: in.Kind,
			EmergencyMonths: in.EmergencyMonths, TargetAmount: in.TargetAmount, StartingAmount: in.StartingAmount, TargetDate: datePtrTime(in.TargetDate),
			MonthlyAmount: in.MonthlyAmount, Color: in.Color, Icon: in.Icon, Archived: in.Archived, ID: id, UserID: a.UserID}); err != nil {
			return err
		}
		return s.syncAchieved(ctx, q, a, cur.AccountID)
	})
	if err != nil {
		return SavingsGoal{}, err
	}
	return s.goalByID(ctx, a, id)
}

func (s *Service) DeleteSavingsGoal(ctx context.Context, a Actor, id int64) error {
	n, err := s.q.DeleteSavingsGoal(ctx, store.DeleteSavingsGoalParams{ID: id, UserID: a.UserID})
	if err != nil {
		return err
	}
	if n == 0 {
		return apperr.NotFound()
	}
	return nil
}

// monthNeed is what month m cost: fixed payments and installments not skipped, plus expenses.
func (s *Service) monthNeed(ctx context.Context, a Actor, m time.Time) (int64, error) {
	if err := s.ensureMonth(ctx, s.q, a, m); err != nil {
		return 0, err
	}
	t, err := s.q.MonthTotals(ctx, store.MonthTotalsParams{UserID: a.UserID, Month: m})
	if err != nil {
		return 0, err
	}
	spent, err := s.q.SpentBetween(ctx, store.SpentBetweenParams{UserID: a.UserID, FromDate: m, ToDate: datex.AddMonths(m, 1).AddDate(0, 0, -1)})
	if err != nil {
		return 0, err
	}
	return t.FixedCommitted + t.Installments + spent, nil
}

// EmergencySuggestion averages the last three completed months that have any cost (or uses the
// current month when none do) and multiplies by `months`, rounded up to 100 pesos.
func (s *Service) EmergencySuggestion(ctx context.Context, a Actor, months int) (EmergencySuggestion, error) {
	if months != 3 && months != 6 {
		return EmergencySuggestion{}, apperr.Validation(map[string]string{"months": "must be 3 or 6"})
	}
	cur := datex.MonthStart(s.today(a))
	var sum, n int64
	for i := 1; i <= 3; i++ {
		need, err := s.monthNeed(ctx, a, datex.AddMonths(cur, -i))
		if err != nil {
			return EmergencySuggestion{}, err
		}
		if need > 0 {
			sum, n = sum+need, n+1
		}
	}
	var need int64
	if n > 0 {
		need = sum / n
	} else {
		var err error
		if need, err = s.monthNeed(ctx, a, cur); err != nil {
			return EmergencySuggestion{}, err
		}
	}
	const step = 10_000 // 100 pesos
	target := (need*int64(months) + step - 1) / step * step
	return EmergencySuggestion{MonthlyNeed: need, Months: int32(months), Target: target}, nil
}
