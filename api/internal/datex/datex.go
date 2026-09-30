// Package datex handles calendar dates and months as UTC-midnight time.Time values.
package datex

import (
	"encoding/json"
	"fmt"
	"time"
)

const monthLayout = "2006-01"

// ParseDate parses a strict YYYY-MM-DD calendar date.
func ParseDate(s string) (time.Time, error) {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid date %q (want YYYY-MM-DD)", s)
	}
	return t, nil
}

// ParseMonth parses a strict YYYY-MM month and returns its first day.
func ParseMonth(s string) (time.Time, error) {
	t, err := time.Parse(monthLayout, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid month %q (want YYYY-MM)", s)
	}
	return t, nil
}

func MonthStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func AddMonths(month time.Time, n int) time.Time {
	return time.Date(month.Year(), month.Month()+time.Month(n), 1, 0, 0, 0, 0, time.UTC)
}

func DaysIn(month time.Time) int {
	return time.Date(month.Year(), month.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// Clamp returns the date for `day` in the month containing `month`,
// moved back to the month's last day when the month is shorter.
func Clamp(month time.Time, day int) time.Time {
	m := MonthStart(month)
	return m.AddDate(0, 0, min(day, DaysIn(m))-1)
}

// MonthsBetween returns the number of whole months from a's month to b's month.
func MonthsBetween(a, b time.Time) int {
	return (b.Year()-a.Year())*12 + int(b.Month()) - int(a.Month())
}

// Today is the calendar date of `now` in `loc`, as UTC midnight.
func Today(now time.Time, loc *time.Location) time.Time {
	l := now.In(loc)
	return time.Date(l.Year(), l.Month(), l.Day(), 0, 0, 0, 0, time.UTC)
}

// Date is a calendar date serialized as "YYYY-MM-DD".
type Date struct{ time.Time }

func NewDate(t time.Time) Date { return Date{t} }

func DatePtr(t *time.Time) *Date {
	if t == nil {
		return nil
	}
	return &Date{*t}
}

func (d Date) MarshalJSON() ([]byte, error) { return json.Marshal(d.Format(time.DateOnly)) }

func (d *Date) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	t, err := ParseDate(s)
	if err != nil {
		return err
	}
	d.Time = t
	return nil
}

// Month is a calendar month serialized as "YYYY-MM"; Time is the first day.
type Month struct{ time.Time }

func NewMonth(t time.Time) Month { return Month{MonthStart(t)} }

func MonthPtr(t *time.Time) *Month {
	if t == nil {
		return nil
	}
	m := NewMonth(*t)
	return &m
}

func (m Month) MarshalJSON() ([]byte, error) { return json.Marshal(m.Format(monthLayout)) }

func (m *Month) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	t, err := ParseMonth(s)
	if err != nil {
		return err
	}
	m.Time = t
	return nil
}
