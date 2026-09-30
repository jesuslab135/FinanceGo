package service

import "testing"

func TestFormatCents(t *testing.T) {
	for in, want := range map[int64]string{0: "0.00", 5: "0.05", 1234: "12.34", -1234: "-12.34", 100000000: "1000000.00"} {
		if got := FormatCents(in); got != want {
			t.Errorf("FormatCents(%d)=%q want %q", in, got, want)
		}
	}
}
