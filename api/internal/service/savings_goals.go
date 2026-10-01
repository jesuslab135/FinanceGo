package service

import (
	"time"

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
	st := savings.GoalStatsFor(mg, savings.Progress(g.ID, d.moves, nil), d.balance(g.AccountID, today), today)
	return SavingsGoal{
		ID: g.ID, AccountID: g.AccountID, Name: g.Name, Kind: g.Kind, EmergencyMonths: g.EmergencyMonths,
		TargetAmount: g.TargetAmount, TargetDate: datex.DatePtr(g.TargetDate), MonthlyAmount: g.MonthlyAmount,
		Color: g.Color, Icon: g.Icon, StartMonth: datex.NewMonth(g.StartMonth), AchievedOn: datex.DatePtr(g.AchievedOn),
		Archived: g.Archived, Progress: st.Progress, Remaining: st.Remaining, Pct: st.Pct,
		RequiredMonthly: st.RequiredMonthly, Status: st.Status, BehindBy: st.BehindBy,
		PlannedThisMonth: savings.PlannedFor(mg, d.moves, datex.MonthStart(today)),
	}
}
