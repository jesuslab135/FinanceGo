package auth

import (
	"strings"
	"testing"
	"time"
)

func TestPasswordRoundTrip(t *testing.T) {
	h, err := HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Fatalf("unexpected encoding %q", h)
	}
	if ok, err := VerifyPassword(h, "correct horse"); !ok || err != nil {
		t.Fatalf("verify good: %v %v", ok, err)
	}
	if ok, _ := VerifyPassword(h, "wrong"); ok {
		t.Fatal("wrong password accepted")
	}
	h2, _ := HashPassword("correct horse")
	if h == h2 {
		t.Fatal("salt not random")
	}
	if _, err := VerifyPassword("garbage", "x"); err == nil {
		t.Fatal("malformed hash should error")
	}
}

func TestTokens(t *testing.T) {
	now := time.Date(2026, 3, 15, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	tk := NewTokens([]byte(strings.Repeat("k", 32)), 15*time.Minute, clock)
	s, err := tk.Issue(42)
	if err != nil {
		t.Fatal(err)
	}
	if id, err := tk.Parse(s); err != nil || id != 42 {
		t.Fatalf("parse: %d %v", id, err)
	}
	now = now.Add(16 * time.Minute)
	if _, err := tk.Parse(s); err == nil {
		t.Fatal("expired token accepted")
	}
	other := NewTokens([]byte(strings.Repeat("z", 32)), 15*time.Minute, clock)
	s2, _ := other.Issue(42)
	if _, err := tk.Parse(s2); err == nil {
		t.Fatal("token signed with other key accepted")
	}
	if _, err := tk.Parse("eyJhbGciOiJub25lIn0.eyJzdWIiOiI0MiJ9."); err == nil {
		t.Fatal("alg=none accepted")
	}
}

func TestRefresh(t *testing.T) {
	raw, hash, err := NewRefresh()
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) < 40 || HashRefresh(raw) != hash || len(hash) != 64 {
		t.Fatalf("raw=%q hash=%q", raw, hash)
	}
	raw2, _, _ := NewRefresh()
	if raw == raw2 {
		t.Fatal("refresh not random")
	}
	f, err := NewFamilyID()
	if err != nil || len(f) != 32 {
		t.Fatalf("family %q %v", f, err)
	}
}
