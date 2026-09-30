package service

import (
	"testing"
	"time"
)

func TestActorTodayUsesUserTimezone(t *testing.T) {
	tj, _ := time.LoadLocation("America/Tijuana")
	a := Actor{UserID: 1, Loc: tj}
	now := time.Date(2026, 4, 1, 3, 0, 0, 0, time.UTC)
	if got := a.Today(now).Format(time.DateOnly); got != "2026-03-31" {
		t.Fatalf("Today=%s, want 2026-03-31", got)
	}
}
