// Package config loads runtime configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
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
	return cfg, nil
}
