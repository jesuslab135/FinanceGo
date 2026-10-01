package savings

import "testing"

func gid(id int64) *int64 { return &id }

func TestGoalProgressNetsTaggedMovementsAndFloorsAtZero(t *testing.T) {
	moves := []Movement{
		{AccountID: 1, GoalID: gid(7), Kind: KindDeposit, Amount: 5_000, On: d("2026-02-01")},
		{AccountID: 1, GoalID: gid(7), Kind: KindWithdrawal, Amount: 1_000, On: d("2026-03-02")},
		{AccountID: 1, GoalID: gid(8), Kind: KindDeposit, Amount: 9_000, On: d("2026-02-01")},
		{AccountID: 1, Kind: KindDeposit, Amount: 9_000, On: d("2026-02-01")},
	}
	if p := GoalProgress(Goal{ID: 7}, moves, nil); p != 4_000 {
		t.Fatalf("GoalProgress = %d, want 4000", p)
	}
	march := d("2026-03-01")
	if p := GoalProgress(Goal{ID: 7}, moves, &march); p != 5_000 {
		t.Fatalf("GoalProgress before March = %d, want 5000", p)
	}
	over := append(moves, Movement{AccountID: 1, GoalID: gid(7), Kind: KindWithdrawal, Amount: 99_000, On: d("2026-03-03")})
	if p := GoalProgress(Goal{ID: 7}, over, nil); p != 0 {
		t.Fatalf("GoalProgress = %d, want 0 (floored)", p)
	}
}

func TestMonthsLeft(t *testing.T) {
	if n := MonthsLeft(d("2026-03-01"), d("2026-03-20")); n != 1 {
		t.Fatalf("same month = %d, want 1", n)
	}
	if n := MonthsLeft(d("2026-03-01"), d("2026-12-31")); n != 10 {
		t.Fatalf("Mar..Dec = %d, want 10", n)
	}
	if n := MonthsLeft(d("2026-03-01"), d("2025-12-01")); n != 1 {
		t.Fatalf("past target = %d, want 1", n)
	}
}

func TestGoalStatsStatuses(t *testing.T) {
	g := Goal{ID: 7, AccountID: 1, Target: 120_000, TargetDate: ptr(d("2026-12-15")), StartMonth: d("2026-01-01")}
	today := d("2026-04-10") // 3 of 12 months elapsed → expected 30000
	cases := []struct {
		progress, balance int64
		status            string
		behindBy          int64
	}{
		{30_000, 1_000_000, StatusOnTrack, 0},
		{28_801, 1_000_000, StatusOnTrack, 0},    // within 1 % of target (1200) below expected
		{28_000, 1_000_000, StatusBehind, 2_000}, // more than 1 % below
		{42_001, 1_000_000, StatusAhead, 0},      // more than 10 % (12000) above
		{120_000, 1_000_000, StatusAchieved, 0},
		{120_000, 100_000, StatusAhead, 0}, // capped by the account balance: 100000 shown, so not achieved
	}
	for i, c := range cases {
		s := GoalStatsFor(g, c.progress, c.balance, today)
		if s.Status != c.status {
			t.Errorf("case %d: status %s, want %s", i, s.Status, c.status)
		}
		if c.behindBy > 0 && (s.BehindBy == nil || *s.BehindBy != c.behindBy) {
			t.Errorf("case %d: BehindBy %v, want %d", i, s.BehindBy, c.behindBy)
		}
	}
	s := GoalStatsFor(g, 30_000, 1_000_000, today)
	// 90000 left over Apr..Dec (9 months) = 10000
	if s.RequiredMonthly == nil || *s.RequiredMonthly != 10_000 || s.Remaining != 90_000 || s.Pct != 25 {
		t.Fatalf("stats %+v", s)
	}
	if s := GoalStatsFor(Goal{ID: 1, Target: 1000, StartMonth: d("2026-01-01")}, 10, 10, today); s.Status != StatusNoDate || s.RequiredMonthly != nil {
		t.Fatalf("no date %+v", s)
	}
	if s := GoalStatsFor(g, 500_000, 500_000, today); s.Pct != 100 || s.Remaining != 0 {
		t.Fatalf("overshoot %+v", s)
	}
}

func TestPlannedFor(t *testing.T) {
	march := d("2026-03-01")
	moves := []Movement{
		{AccountID: 1, GoalID: gid(1), Kind: KindDeposit, Amount: 95_000, On: d("2026-02-10")},
		{AccountID: 1, GoalID: gid(1), Kind: KindDeposit, Amount: 1_000, On: d("2026-03-05")}, // inside March: ignored for the plan
	}
	cases := []struct {
		name string
		g    Goal
		want int64
	}{
		{"monthly amount", Goal{ID: 2, Target: 100_000, Monthly: ptr[int64](2_000), StartMonth: d("2026-01-01")}, 2_000},
		{"capped by remaining", Goal{ID: 1, Target: 100_000, Monthly: ptr[int64](10_000), StartMonth: d("2026-01-01")}, 5_000},
		{"required from date", Goal{ID: 3, Target: 100_000, TargetDate: ptr(d("2026-12-31")), StartMonth: d("2026-01-01")}, 10_000},
		{"no plan", Goal{ID: 4, Target: 100_000, StartMonth: d("2026-01-01")}, 0},
		{"target date passed", Goal{ID: 5, Target: 100_000, TargetDate: ptr(d("2026-02-28")), StartMonth: d("2026-01-01")}, 0},
		{"starts later", Goal{ID: 6, Target: 100_000, Monthly: ptr[int64](2_000), StartMonth: d("2026-04-01")}, 0},
		{"archived", Goal{ID: 7, Target: 100_000, Monthly: ptr[int64](2_000), StartMonth: d("2026-01-01"), Archived: true}, 0},
		{"achieved before month", Goal{ID: 8, Target: 100_000, Monthly: ptr[int64](2_000), StartMonth: d("2026-01-01"), AchievedOn: ptr(d("2026-02-20"))}, 0},
		{"achieved during month", Goal{ID: 9, Target: 100_000, Monthly: ptr[int64](2_000), StartMonth: d("2026-01-01"), AchievedOn: ptr(d("2026-03-20"))}, 2_000},
	}
	for _, c := range cases {
		if got := PlannedFor(c.g, moves, march); got != c.want {
			t.Errorf("%s: PlannedFor = %d, want %d", c.name, got, c.want)
		}
	}
}

func TestMonthSaved(t *testing.T) {
	goals := []Goal{
		{ID: 1, Target: 1_000_000, Monthly: ptr[int64](200_000), StartMonth: d("2026-01-01")},
		{ID: 2, Target: 1_000_000, Monthly: ptr[int64](150_000), StartMonth: d("2026-01-01")},
	}
	today := d("2026-03-15")
	march := d("2026-03-01")
	dep := func(amount int64, on string) Movement {
		return Movement{AccountID: 1, Kind: KindDeposit, Amount: amount, On: d(on)}
	}
	// Planned 350000 > deposited 200000 → Saved 350000.
	s := MonthSaved(goals, []Movement{dep(200_000, "2026-03-03")}, march, today)
	if s != (MonthSaving{Planned: 350_000, Deposited: 200_000, Saved: 350_000}) {
		t.Fatalf("under plan %+v", s)
	}
	// Deposited 450000 > planned → Saved 450000; transfers and other months don't count.
	moves := []Movement{dep(200_000, "2026-03-03"), dep(250_000, "2026-03-20"), dep(1, "2026-02-28"),
		{AccountID: 1, ToAccountID: gid(2), Kind: KindTransfer, Amount: 70_000, On: d("2026-03-04")}}
	if s := MonthSaved(goals, moves, march, today); s.Saved != 450_000 || s.Deposited != 450_000 {
		t.Fatalf("over plan %+v", s)
	}
	// A withdrawal makes Saved negative when nothing is planned.
	w := []Movement{{AccountID: 1, Kind: KindWithdrawal, Amount: 500_000, On: d("2026-03-05")}}
	if s := MonthSaved(nil, w, march, today); s.Saved != -500_000 || s.Withdrawn != 500_000 {
		t.Fatalf("withdrawal %+v", s)
	}
	// A future month counts only the plan.
	if s := MonthSaved(goals, moves, d("2026-05-01"), today); s != (MonthSaving{Planned: 350_000, Saved: 350_000}) {
		t.Fatalf("future %+v", s)
	}
}

func TestGoalProgressCountsStartingAmount(t *testing.T) {
	g := Goal{ID: 7, Start: 30_000}
	if p := GoalProgress(g, nil, nil); p != 30_000 {
		t.Fatalf("start alone = %d, want 30000", p)
	}
	moves := []Movement{
		{AccountID: 1, GoalID: gid(7), Kind: KindDeposit, Amount: 5_000, On: d("2026-02-01")},
		{AccountID: 1, GoalID: gid(7), Kind: KindWithdrawal, Amount: 50_000, On: d("2026-03-02")},
	}
	if p := GoalProgress(g, moves[:1], nil); p != 35_000 {
		t.Fatalf("start + deposit = %d, want 35000", p)
	}
	if p := GoalProgress(g, moves, nil); p != 0 {
		t.Fatalf("start + withdrawals = %d, want 0 (floored)", p)
	}
}

func TestPlannedForWithStartingAmount(t *testing.T) {
	march := d("2026-03-01")
	covered := Goal{ID: 1, Target: 100_000, Start: 100_000, Monthly: ptr[int64](2_000), StartMonth: d("2026-01-01")}
	if got := PlannedFor(covered, nil, march); got != 0 {
		t.Fatalf("covered goal plans %d, want 0", got)
	}
	partial := Goal{ID: 2, Target: 200_000, Start: 50_000, TargetDate: ptr(d("2026-12-31")), StartMonth: d("2026-01-01")}
	if got := PlannedFor(partial, nil, march); got != 15_000 { // ceil(150000 / 10)
		t.Fatalf("partial start plans %d, want 15000", got)
	}
}

func TestMonthSavedIgnoresStartingAmount(t *testing.T) {
	goals := []Goal{{ID: 1, Target: 1_000_000, Start: 400_000, StartMonth: d("2026-01-01")}}
	s := MonthSaved(goals, nil, d("2026-03-01"), d("2026-03-15"))
	if s != (MonthSaving{}) {
		t.Fatalf("start leaked into Saved: %+v", s)
	}
}
