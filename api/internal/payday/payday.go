// Package payday computes the dates an income source pays on.
package payday

import (
	"time"

	"financego/internal/datex"
)

const (
	Monthly     = "monthly"
	Semimonthly = "semimonthly"
	Biweekly    = "biweekly"
	Weekly      = "weekly"
)

func Valid(frequency string) bool {
	switch frequency {
	case Monthly, Semimonthly, Biweekly, Weekly:
		return true
	}
	return false
}

// Anchored reports whether the frequency counts days from a known pay date
// instead of using days of the month.
func Anchored(frequency string) bool { return frequency == Weekly || frequency == Biweekly }

// Schedule is when an income source pays. Day and SecondDay are days of the
// month (monthly, semimonthly); Anchor is any real pay date (weekly, biweekly).
type Schedule struct {
	Frequency string
	Day       int
	SecondDay int
	Anchor    time.Time
}

// Dates returns the pay dates that fall in month, in order. Days past the end
// of a shorter month move back to its last day.
func (s Schedule) Dates(month time.Time) []time.Time {
	m := datex.MonthStart(month)
	switch s.Frequency {
	case Semimonthly:
		a, b := datex.Clamp(m, s.Day), datex.Clamp(m, s.SecondDay)
		if b.Before(a) {
			a, b = b, a
		}
		return []time.Time{a, b}
	case Weekly, Biweekly:
		step := 7
		if s.Frequency == Biweekly {
			step = 14
		}
		anchor := time.Date(s.Anchor.Year(), s.Anchor.Month(), s.Anchor.Day(), 0, 0, 0, 0, time.UTC)
		// Days from the month's first day to the first pay date on or after it.
		off := (int(anchor.Sub(m).Hours()/24)%step + step) % step
		var out []time.Time
		for d := m.AddDate(0, 0, off); d.Month() == m.Month(); d = d.AddDate(0, 0, step) {
			out = append(out, d)
		}
		return out
	default:
		return []time.Time{datex.Clamp(m, s.Day)}
	}
}
