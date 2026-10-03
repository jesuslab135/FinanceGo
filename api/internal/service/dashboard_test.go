package service

import (
	"testing"
	"time"
)

func TestSafeToSpend(t *testing.T) {
	mar := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	per, days, ok := SafeToSpend(1_900_000, time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC), mar)
	if !ok || days != 17 || per != 111764 {
		t.Fatalf("mid-month: %d %d %v", per, days, ok)
	}
	per, days, ok = SafeToSpend(-500, time.Date(2026, 3, 31, 0, 0, 0, 0, time.UTC), mar)
	if !ok || days != 1 || per != 0 {
		t.Fatalf("negative: %d %d %v", per, days, ok)
	}
	if _, _, ok := SafeToSpend(100, time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC), mar); ok {
		t.Fatal("past month should not report safe-to-spend")
	}
}
