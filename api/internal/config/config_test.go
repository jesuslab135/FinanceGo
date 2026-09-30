package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadFromDefaults(t *testing.T) {
	cfg, err := LoadFrom(env(map[string]string{
		"DATABASE_URL": "postgres://x",
		"JWT_SECRET":   strings.Repeat("s", 32),
		"WEB_ORIGIN":   "http://localhost:3000",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || !cfg.CookieSecure || cfg.AuthRatePerMin != 10 {
		t.Fatalf("bad defaults: %+v", cfg)
	}
	if cfg.AccessTTL != 15*time.Minute || cfg.RefreshTTL != 30*24*time.Hour {
		t.Fatalf("bad ttls: %v %v", cfg.AccessTTL, cfg.RefreshTTL)
	}
}

func TestLoadFromOverrides(t *testing.T) {
	cfg, err := LoadFrom(env(map[string]string{
		"DATABASE_URL": "postgres://x", "JWT_SECRET": strings.Repeat("s", 40),
		"WEB_ORIGIN": "https://app.example", "API_PORT": "9000",
		"COOKIE_SECURE": "false", "AUTH_RATE_PER_MIN": "50",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "9000" || cfg.CookieSecure || cfg.AuthRatePerMin != 50 {
		t.Fatalf("overrides ignored: %+v", cfg)
	}
}

func TestLoadFromErrors(t *testing.T) {
	cases := map[string]map[string]string{
		"missing db":   {"JWT_SECRET": strings.Repeat("s", 32), "WEB_ORIGIN": "x"},
		"short secret": {"DATABASE_URL": "x", "JWT_SECRET": "short", "WEB_ORIGIN": "x"},
		"no origin":    {"DATABASE_URL": "x", "JWT_SECRET": strings.Repeat("s", 32)},
		"bad bool":     {"DATABASE_URL": "x", "JWT_SECRET": strings.Repeat("s", 32), "WEB_ORIGIN": "x", "COOKIE_SECURE": "maybe"},
		"bad rate":     {"DATABASE_URL": "x", "JWT_SECRET": strings.Repeat("s", 32), "WEB_ORIGIN": "x", "AUTH_RATE_PER_MIN": "0"},
	}
	for name, m := range cases {
		if _, err := LoadFrom(env(m)); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}
