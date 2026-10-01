package service

import (
	"context"
	"slices"
	"time"

	"financego/internal/savings"
	"financego/internal/store"
)

// savingsData is everything one user has in the savings module, loaded once per request;
// the math in internal/savings runs over it in memory.
type savingsData struct {
	accounts []store.SavingsAccount
	goals    []store.SavingsGoal
	vals     map[int64][]savings.Valuation
	moves    []savings.Movement
}

func (s *Service) loadSavings(ctx context.Context, q *store.Queries, userID int64) (savingsData, error) {
	var d savingsData
	var err error
	if d.accounts, err = q.ListSavingsAccounts(ctx, userID); err != nil {
		return d, err
	}
	if d.goals, err = q.ListSavingsGoals(ctx, userID); err != nil {
		return d, err
	}
	vrows, err := q.ListAccountValuationsForUser(ctx, userID)
	if err != nil {
		return d, err
	}
	mrows, err := q.ListAccountMovementsForUser(ctx, userID)
	if err != nil {
		return d, err
	}
	d.vals = make(map[int64][]savings.Valuation, len(d.accounts))
	for _, v := range vrows {
		d.vals[v.AccountID] = append(d.vals[v.AccountID], savings.Valuation{Value: v.Value, On: v.ValuedOn})
	}
	d.moves = make([]savings.Movement, len(mrows))
	for i, m := range mrows {
		d.moves[i] = mathMovement(m)
	}
	return d, nil
}

func mathMovement(m store.AccountMovement) savings.Movement {
	return savings.Movement{ID: m.ID, AccountID: m.AccountID, ToAccountID: m.ToAccountID, GoalID: m.GoalID,
		Kind: m.Kind, Amount: m.Amount, On: m.OccurredOn}
}

func mathAccount(a store.SavingsAccount) savings.Account {
	return savings.Account{ID: a.ID, Kind: a.Kind, Institution: a.Institution, OpeningBalance: a.OpeningBalance,
		OpeningDate: a.OpeningDate, RateBP: a.AnnualRateBp, ArchivedOn: a.ArchivedOn}
}

func mathGoal(g store.SavingsGoal) savings.Goal {
	return savings.Goal{ID: g.ID, AccountID: g.AccountID, Target: g.TargetAmount, TargetDate: g.TargetDate,
		Monthly: g.MonthlyAmount, StartMonth: g.StartMonth, AchievedOn: g.AchievedOn, Archived: g.Archived}
}

func (d savingsData) account(id int64) (store.SavingsAccount, bool) {
	i := slices.IndexFunc(d.accounts, func(a store.SavingsAccount) bool { return a.ID == id })
	if i < 0 {
		return store.SavingsAccount{}, false
	}
	return d.accounts[i], true
}

func (d savingsData) goal(id int64) (store.SavingsGoal, bool) {
	i := slices.IndexFunc(d.goals, func(g store.SavingsGoal) bool { return g.ID == id })
	if i < 0 {
		return store.SavingsGoal{}, false
	}
	return d.goals[i], true
}

func (d savingsData) balance(id int64, t time.Time) int64 {
	a, ok := d.account(id)
	if !ok {
		return 0
	}
	b, _ := savings.Balance(mathAccount(a), d.vals[id], d.moves, t)
	return b
}

func (d savingsData) mathGoals() []savings.Goal {
	out := make([]savings.Goal, len(d.goals))
	for i, g := range d.goals {
		out[i] = mathGoal(g)
	}
	return out
}

// hasMoneyHistory: the account has movements (either side) or valuations, so its opening is locked.
func (d savingsData) hasMoneyHistory(id int64) bool {
	return len(d.vals[id]) > 0 || slices.ContainsFunc(d.moves, func(m savings.Movement) bool { return savings.Flow(m, id) != 0 })
}

// hasHistory: anything refers to the account, so it can only be archived, not deleted.
func (d savingsData) hasHistory(id int64) bool {
	return d.hasMoneyHistory(id) || slices.ContainsFunc(d.goals, func(g store.SavingsGoal) bool { return g.AccountID == id })
}

// without returns d minus one movement (to validate an edit against the balance before it).
func (d savingsData) without(movementID int64) savingsData {
	d.moves = slices.DeleteFunc(slices.Clone(d.moves), func(m savings.Movement) bool { return m.ID == movementID })
	return d
}

// syncAchieved sets achieved_on the first time a goal on accountIDs reaches its target and clears it
// when the goal drops below again. Call it inside the transaction that changed money or values.
func (s *Service) syncAchieved(ctx context.Context, q *store.Queries, a Actor, accountIDs ...int64) error {
	d, err := s.loadSavings(ctx, q, a.UserID)
	if err != nil {
		return err
	}
	today := s.today(a)
	for _, g := range d.goals {
		if !slices.Contains(accountIDs, g.AccountID) {
			continue
		}
		st := savings.GoalStatsFor(mathGoal(g), savings.Progress(g.ID, d.moves, nil), d.balance(g.AccountID, today), today)
		var set *time.Time
		switch reached := st.Status == savings.StatusAchieved; {
		case reached && g.AchievedOn == nil:
			set = &today
		case !reached && g.AchievedOn != nil:
			set = nil
		default:
			continue
		}
		if err := q.SetSavingsGoalAchieved(ctx, store.SetSavingsGoalAchievedParams{AchievedOn: set, ID: g.ID, UserID: a.UserID}); err != nil {
			return err
		}
	}
	return nil
}
