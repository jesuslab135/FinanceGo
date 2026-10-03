package datex

import (
	"encoding/json"
	"testing"
	"time"
)

func d(s string) time.Time { t, _ := ParseDate(s); return t }

func TestClamp(t *testing.T) {
	cases := []struct {
		month string
		day   int
		want  string
	}{
		{"2026-02-01", 31, "2026-02-28"},
		{"2028-02-01", 31, "2028-02-29"}, // leap year
		{"2028-02-01", 29, "2028-02-29"},
		{"2026-04-01", 31, "2026-04-30"},
		{"2026-01-01", 31, "2026-01-31"},
		{"2026-03-01", 1, "2026-03-01"},
		{"2026-12-01", 15, "2026-12-15"},
	}
	for _, c := range cases {
		if got := Clamp(d(c.month), c.day); !got.Equal(d(c.want)) {
			t.Errorf("Clamp(%s,%d)=%s want %s", c.month, c.day, got.Format(time.DateOnly), c.want)
		}
	}
}

func TestMonthHelpers(t *testing.T) {
	if got := MonthStart(d("2026-03-17")); !got.Equal(d("2026-03-01")) {
		t.Errorf("MonthStart=%v", got)
	}
	if got := AddMonths(d("2026-11-01"), 3); !got.Equal(d("2027-02-01")) {
		t.Errorf("AddMonths=%v", got)
	}
	if got := AddMonths(d("2026-01-01"), -1); !got.Equal(d("2025-12-01")) {
		t.Errorf("AddMonths neg=%v", got)
	}
	if DaysIn(d("2028-02-01")) != 29 || DaysIn(d("2026-02-01")) != 28 {
		t.Error("DaysIn wrong")
	}
	if MonthsBetween(d("2026-11-01"), d("2027-02-01")) != 3 || MonthsBetween(d("2026-03-01"), d("2026-01-01")) != -2 {
		t.Error("MonthsBetween wrong")
	}
}

func TestToday(t *testing.T) {
	tj, err := time.LoadLocation("America/Tijuana")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 4, 1, 3, 0, 0, 0, time.UTC) // Mar 31 20:00 in Tijuana
	if got := Today(now, tj); !got.Equal(d("2026-03-31")) {
		t.Errorf("Today=%v", got)
	}
	if got := Today(now, time.UTC); !got.Equal(d("2026-04-01")) {
		t.Errorf("Today UTC=%v", got)
	}
}

func TestParse(t *testing.T) {
	for _, bad := range []string{"", "2026-13-01", "2026-02-30", "03/15/2026", "2026-3-5"} {
		if _, err := ParseDate(bad); err == nil {
			t.Errorf("ParseDate(%q) should fail", bad)
		}
	}
	m, err := ParseMonth("2026-03")
	if err != nil || !m.Equal(d("2026-03-01")) {
		t.Errorf("ParseMonth=%v %v", m, err)
	}
	if _, err := ParseMonth("2026-3"); err == nil {
		t.Error("ParseMonth should reject 2026-3")
	}
}

func TestJSON(t *testing.T) {
	type payload struct {
		D  Date   `json:"d"`
		M  Month  `json:"m"`
		DP *Date  `json:"dp"`
		MP *Month `json:"mp"`
	}
	b, err := json.Marshal(payload{D: NewDate(d("2026-03-05")), M: NewMonth(d("2026-03-01"))})
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != `{"d":"2026-03-05","m":"2026-03","dp":null,"mp":null}` {
		t.Fatalf("marshal=%s", b)
	}
	var p payload
	if err := json.Unmarshal([]byte(`{"d":"2026-03-05","m":"2026-03","dp":"2026-01-02","mp":null}`), &p); err != nil {
		t.Fatal(err)
	}
	if !p.D.Equal(d("2026-03-05")) || p.DP == nil || !p.DP.Equal(d("2026-01-02")) || p.MP != nil {
		t.Fatalf("unmarshal=%+v", p)
	}
	if err := json.Unmarshal([]byte(`{"d":"05/03/2026"}`), &p); err == nil {
		t.Fatal("expected error for bad date")
	}
}
