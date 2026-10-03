package cards

import (
	"slices"
	"testing"
	"time"

	"financego/internal/datex"
)

func d(s string) time.Time {
	t, err := datex.ParseDate(s)
	if err != nil {
		panic(err)
	}
	return t
}

func ds(t time.Time) string { return t.Format(time.DateOnly) }

func TestCycles(t *testing.T) {
	if got := CycleClose(d("2026-02-01"), 31); ds(got) != "2026-02-28" {
		t.Errorf("close feb/31 = %s", ds(got))
	}
	if got := CycleOpen(d("2026-03-01"), 31); ds(got) != "2026-03-01" {
		t.Errorf("open mar/31 = %s", ds(got))
	}
	if got := CycleOpen(d("2026-03-01"), 15); ds(got) != "2026-02-16" {
		t.Errorf("open mar/15 = %s", ds(got))
	}
	if got := CycleFor(d("2026-12-20"), 15); ds(got) != "2027-01-01" {
		t.Errorf("cycle for dec 20 = %s", ds(got))
	}
}

func TestInstallmentCycleOnStatementDay(t *testing.T) {
	if got := CycleFor(d("2026-03-15"), 15); ds(got) != "2026-03-01" {
		t.Fatalf("purchase on close day → cycle %s, want March", ds(got))
	}
	if got := CycleFor(d("2026-03-16"), 15); ds(got) != "2026-04-01" {
		t.Fatalf("purchase day after close → cycle %s, want April", ds(got))
	}
	p := Plan{Total: 900, N: 3, PurchasedOn: d("2026-03-15")}
	if InstallmentIn(p, 15, d("2026-03-01")) != 1 || InstallmentIn(p, 15, d("2026-05-01")) != 3 || InstallmentIn(p, 15, d("2026-06-01")) != 0 {
		t.Fatal("installment numbering wrong for purchase on close day")
	}
}

func TestDueDateAndRelevantCycle(t *testing.T) {
	cases := [][3]string{
		{"2026-03-15", "5", "2026-04-05"},
		{"2026-03-15", "25", "2026-03-25"},
		{"2026-01-31", "30", "2026-02-28"},
		{"2026-03-15", "15", "2026-04-15"},
	}
	for _, c := range cases {
		day := map[string]int{"5": 5, "25": 25, "30": 30, "15": 15}[c[1]]
		if got := DueDate(d(c[0]), day); ds(got) != c[2] {
			t.Errorf("DueDate(%s,%s)=%s want %s", c[0], c[1], ds(got), c[2])
		}
	}
	if got := RelevantCycle(d("2026-03-20"), 15, 5); ds(got) != "2026-03-01" {
		t.Errorf("between close and due → last closed cycle, got %s", ds(got))
	}
	if got := RelevantCycle(d("2026-04-06"), 15, 5); ds(got) != "2026-04-01" {
		t.Errorf("after due → current cycle, got %s", ds(got))
	}
	if got := RelevantCycle(d("2026-03-15"), 15, 5); ds(got) != "2026-03-01" {
		t.Errorf("on close day → that cycle, got %s", ds(got))
	}
}

func TestInstallmentsSplit(t *testing.T) {
	if got := Installments(1000, 3); !slices.Equal(got, []int64{333, 333, 334}) {
		t.Fatalf("split %v", got)
	}
	var sum int64
	for _, x := range Installments(100001, 12) {
		sum += x
	}
	if sum != 100001 {
		t.Fatalf("sum %d", sum)
	}
}

func TestPlansAcrossYearAndCancellation(t *testing.T) {
	p := Plan{Total: 900, N: 3, PurchasedOn: d("2026-11-20")}
	if got := InstallmentCycle(p, 15, 3); ds(got) != "2027-02-01" {
		t.Fatalf("3rd installment cycle %s", ds(got))
	}
	q := Plan{Total: 900, N: 3, PurchasedOn: d("2026-03-10")}
	if n, amt := Billed(q, 15, d("2026-04-15")); n != 2 || amt != 600 {
		t.Fatalf("billed %d %d", n, amt)
	}
	if n, _ := Billed(q, 15, d("2026-03-14")); n != 0 {
		t.Fatalf("billed before first close %d", n)
	}
	if Debt(q, 15) != 900 {
		t.Fatal("active plan debt should be the total")
	}
	cancel := d("2026-04-01")
	q.CancelledOn = &cancel
	if Debt(q, 15) != 300 {
		t.Fatalf("cancelled debt %d, want 300", Debt(q, 15))
	}
	if InstallmentIn(q, 15, d("2026-04-01")) != 0 {
		t.Fatal("installment after cancellation still billed")
	}
}

func TestCompute(t *testing.T) {
	c := Card{StatementDay: 15, DueDay: 5, OpeningBalance: 1000, OpeningDate: d("2026-01-01")}
	charges := []Movement{
		{d("2025-12-31"), 9999}, // before opening: ignored
		{d("2026-02-20"), 500},
		{d("2026-03-10"), 200},
		{d("2026-03-20"), 300}, // next cycle
	}
	payments := []Movement{{d("2026-03-01"), 400}, {d("2026-04-01"), 700}}
	plans := []Plan{{Total: 900, N: 3, PurchasedOn: d("2026-03-10")}}
	r := Compute(c, charges, payments, plans, d("2026-03-01"))
	if ds(r.Opens) != "2026-02-16" || ds(r.Closes) != "2026-03-15" || ds(r.Due) != "2026-04-05" {
		t.Fatalf("dates %s %s %s", ds(r.Opens), ds(r.Closes), ds(r.Due))
	}
	// 1000 + 500 + 200 + 300 (installment 1) - 400
	if r.BilledBalance != 1600 {
		t.Fatalf("billed %d", r.BilledBalance)
	}
	if r.AmountDue != 900 { // 1600 - 700 paid before due
		t.Fatalf("due %d", r.AmountDue)
	}
	// 1000 + 1000 charges + 900 plan - 1100 payments
	if r.CurrentBalance != 1800 {
		t.Fatalf("current %d", r.CurrentBalance)
	}
	over := Compute(c, charges, append(payments, Movement{d("2026-04-02"), 5000}), plans, d("2026-03-01"))
	if over.AmountDue != 0 {
		t.Fatalf("overpaid amount due %d", over.AmountDue)
	}
}
