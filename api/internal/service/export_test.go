package service

import "testing"

func TestFormatCents(t *testing.T) {
	for in, want := range map[int64]string{0: "0.00", 5: "0.05", 1234: "12.34", -1234: "-12.34", 100000000: "1000000.00"} {
		if got := FormatCents(in); got != want {
			t.Errorf("FormatCents(%d)=%q want %q", in, got, want)
		}
	}
}

func TestSafeCell(t *testing.T) {
	for in, want := range map[string]string{
		"": "", "plain": "plain", "=SUM(A1)": "'=SUM(A1)", "+1": "'+1", "-1": "'-1", "@x": "'@x",
		"\tx": "'\tx", "\rx": "'\rx", "a=b": "a=b",
	} {
		if got := safeCell(in); got != want {
			t.Errorf("safeCell(%q)=%q want %q", in, got, want)
		}
	}
}
