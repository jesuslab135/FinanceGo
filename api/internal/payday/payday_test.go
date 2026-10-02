package payday

import (
	"strings"
	"testing"
	"time"
)

func d(s string) time.Time {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestDates(t *testing.T) {
	cases := []struct {
		name  string
		s     Schedule
		month string
		want  string
	}{
		{"monthly", Schedule{Frequency: Monthly, Day: 15}, "2026-10-01", "2026-10-15"},
		{"monthly clamps to a short month", Schedule{Frequency: Monthly, Day: 31}, "2026-02-01", "2026-02-28"},
		{"semimonthly", Schedule{Frequency: Semimonthly, Day: 15, SecondDay: 30}, "2026-10-01", "2026-10-15 2026-10-30"},
		{"semimonthly clamps the second day", Schedule{Frequency: Semimonthly, Day: 15, SecondDay: 30}, "2026-02-01", "2026-02-15 2026-02-28"},
		{"semimonthly sorts its days", Schedule{Frequency: Semimonthly, Day: 20, SecondDay: 5}, "2026-10-01", "2026-10-05 2026-10-20"},
		// 2026-10-02 is a Friday.
		{"weekly with five paydays", Schedule{Frequency: Weekly, Anchor: d("2026-10-02")}, "2026-10-01", "2026-10-02 2026-10-09 2026-10-16 2026-10-23 2026-10-30"},
		{"weekly with four paydays", Schedule{Frequency: Weekly, Anchor: d("2026-10-02")}, "2026-11-01", "2026-11-06 2026-11-13 2026-11-20 2026-11-27"},
		{"weekly before the anchor", Schedule{Frequency: Weekly, Anchor: d("2026-10-02")}, "2026-09-01", "2026-09-04 2026-09-11 2026-09-18 2026-09-25"},
		{"weekly anchored on the first", Schedule{Frequency: Weekly, Anchor: d("2026-10-01")}, "2026-10-01", "2026-10-01 2026-10-08 2026-10-15 2026-10-22 2026-10-29"},
		{"biweekly", Schedule{Frequency: Biweekly, Anchor: d("2026-10-02")}, "2026-10-01", "2026-10-02 2026-10-16 2026-10-30"},
		{"biweekly next month", Schedule{Frequency: Biweekly, Anchor: d("2026-10-02")}, "2026-11-01", "2026-11-13 2026-11-27"},
		{"biweekly before the anchor", Schedule{Frequency: Biweekly, Anchor: d("2026-10-02")}, "2026-09-01", "2026-09-04 2026-09-18"},
		{"biweekly across a year", Schedule{Frequency: Biweekly, Anchor: d("2026-10-02")}, "2027-10-01", "2027-10-01 2027-10-15 2027-10-29"},
	}
	for _, c := range cases {
		var got []string
		for _, x := range c.s.Dates(d(c.month)) {
			got = append(got, x.Format(time.DateOnly))
		}
		if g := strings.Join(got, " "); g != c.want {
			t.Errorf("%s: got %s, want %s", c.name, g, c.want)
		}
	}
}

func TestValid(t *testing.T) {
	for _, f := range []string{Monthly, Semimonthly, Biweekly, Weekly} {
		if !Valid(f) {
			t.Errorf("%s should be valid", f)
		}
	}
	if Valid("") || Valid("daily") {
		t.Error("unknown frequencies must be rejected")
	}
	if !Anchored(Weekly) || !Anchored(Biweekly) || Anchored(Monthly) || Anchored(Semimonthly) {
		t.Error("only weekly and biweekly are anchored")
	}
}
