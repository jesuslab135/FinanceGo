// Package config loads runtime configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL    string
	JWTSecret      []byte
	WebOrigin      string
	Port           string
	CookieSecure   bool
	AccessTTL      time.Duration
	RefreshTTL     time.Duration
	AuthRatePerMin int
	// TrustedProxies lists proxy IPs/CIDRs whose X-Forwarded-For is honored (empty = trust none).
	TrustedProxies []string
}

func Load() (Config, error) { return LoadFrom(os.Getenv) }

func LoadFrom(get func(string) string) (Config, error) {
	cfg := Config{
		DatabaseURL:    get("DATABASE_URL"),
		JWTSecret:      []byte(get("JWT_SECRET")),
		WebOrigin:      get("WEB_ORIGIN"),
		Port:           get("API_PORT"),
		CookieSecure:   true,
		AccessTTL:      15 * time.Minute,
		RefreshTTL:     30 * 24 * time.Hour,
		AuthRatePerMin: 10,
	}
	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return cfg, errors.New("JWT_SECRET must be at least 32 bytes")
	}
	if strings.Contains(string(cfg.JWTSecret), "change-me") {
		return cfg, errors.New("JWT_SECRET still holds the .env.example placeholder; set a random secret")
	}
	if cfg.WebOrigin == "" {
		return cfg, errors.New("WEB_ORIGIN is required")
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if v := get("COOKIE_SECURE"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return cfg, fmt.Errorf("COOKIE_SECURE: %w", err)
		}
		cfg.CookieSecure = b
	}
	if v := get("AUTH_RATE_PER_MIN"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return cfg, errors.New("AUTH_RATE_PER_MIN must be a positive integer")
		}
		cfg.AuthRatePerMin = n
	}
	for _, p := range strings.Split(get("TRUSTED_PROXIES"), ",") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, err := netip.ParsePrefix(p); err != nil {
			if _, err := netip.ParseAddr(p); err != nil {
				return cfg, fmt.Errorf("TRUSTED_PROXIES: invalid IP or CIDR %q", p)
			}
		}
		cfg.TrustedProxies = append(cfg.TrustedProxies, p)
	}
	return cfg, nil
}
