package savings

import (
	"time"

	"financego/internal/datex"
)

const (
	StatusAchieved = "achieved"
	StatusNoDate   = "no_date"
	StatusAhead    = "ahead"
	StatusOnTrack  = "on_track"
	StatusBehind   = "behind"
)

type Goal struct {
	ID         int64
	AccountID  int64
	Target     int64
	TargetDate *time.Time
	Monthly    *int64
	StartMonth time.Time
	AchievedOn *time.Time
	Archived   bool
}

// Progress is the net amount tagged to goalID (deposits − withdrawals), counting only movements
// dated before `before` when it is set. It never goes below zero.
func Progress(goalID int64, moves []Movement, before *time.Time) int64 {
	var p int64
	for _, m := range moves {
		if m.GoalID == nil || *m.GoalID != goalID || (before != nil && !m.On.Before(*before)) {
			continue
		}
		switch m.Kind {
		case KindDeposit:
			p += m.Amount
		case KindWithdrawal:
			p -= m.Amount
		}
	}
	return max(p, 0)
}

// MonthsLeft counts the months from `month` through the month of `target`, both included, and is at least 1.
func MonthsLeft(month, target time.Time) int64 {
	return int64(max(datex.MonthsBetween(month, target)+1, 1))
}

func ceilDiv(a, b int64) int64 { return (a + b - 1) / b }

type GoalStats struct {
	Progress        int64 // shown progress: capped at the account balance
	Remaining       int64
	Pct             int32 // 0..100
	RequiredMonthly *int64
	Status          string
	BehindBy        *int64
}

// GoalStatsFor evaluates g on `today`. `progress` is Progress(g.ID, moves, nil); the account balance
// caps it so a loss in the account shows on its goals.
func GoalStatsFor(g Goal, progress, accountBalance int64, today time.Time) GoalStats {
	shown := min(progress, max(accountBalance, 0))
	st := GoalStats{Progress: shown, Remaining: max(g.Target-shown, 0), Pct: int32(min(shown*100/g.Target, 100))}
	month := datex.MonthStart(today)
	if g.TargetDate != nil && st.Remaining > 0 {
		r := ceilDiv(st.Remaining, MonthsLeft(month, *g.TargetDate))
		st.RequiredMonthly = &r
	}
	switch {
	case shown >= g.Target:
		st.Status = StatusAchieved
	case g.TargetDate == nil:
		st.Status = StatusNoDate
	default:
		total := max(int64(datex.MonthsBetween(g.StartMonth, *g.TargetDate)+1), 1)
		elapsed := min(max(int64(datex.MonthsBetween(g.StartMonth, month)), 0), total)
		expected := g.Target * elapsed / total
		switch {
		case shown < expected-g.Target/100:
			behind := expected - shown
			st.Status, st.BehindBy = StatusBehind, &behind
		case shown > expected+g.Target/10:
			st.Status = StatusAhead
		default:
			st.Status = StatusOnTrack
		}
	}
	return st
}

// PlannedFor is g's planned contribution for `month` (first day), computed from progress at the
// start of the month so it does not move while the user deposits. It is capped at what is left.
func PlannedFor(g Goal, moves []Movement, month time.Time) int64 {
	if g.Archived || g.StartMonth.After(month) || (g.AchievedOn != nil && g.AchievedOn.Before(month)) {
		return 0
	}
	remaining := max(g.Target-Progress(g.ID, moves, &month), 0)
	var plan int64
	switch {
	case g.Monthly != nil:
		plan = *g.Monthly
	case g.TargetDate != nil && !g.TargetDate.Before(month):
		plan = ceilDiv(remaining, MonthsLeft(month, *g.TargetDate))
	}
	return min(plan, remaining)
}

type MonthSaving struct {
	Planned   int64
	Deposited int64
	Withdrawn int64
	Saved     int64
}

// MonthSaved is the budget's Saved line for `month`: max(Planned, Deposited) − Withdrawn.
// Transfers never count. Future months count only the plan.
func MonthSaved(goals []Goal, moves []Movement, month, today time.Time) MonthSaving {
	var s MonthSaving
	for _, g := range goals {
		s.Planned += PlannedFor(g, moves, month)
	}
	if month.After(datex.MonthStart(today)) {
		s.Saved = s.Planned
		return s
	}
	next := datex.AddMonths(month, 1)
	for _, m := range moves {
		if m.On.Before(month) || !m.On.Before(next) {
			continue
		}
		switch m.Kind {
		case KindDeposit:
			s.Deposited += m.Amount
		case KindWithdrawal:
			s.Withdrawn += m.Amount
		}
	}
	s.Saved = max(s.Planned, s.Deposited) - s.Withdrawn
	return s
}
