package httpapi_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"financego/internal/auth"
	"financego/internal/config"
	"financego/internal/httpapi"
	"financego/internal/service"
	"financego/internal/testutil"
)

type M = map[string]any

// harness runs the real router against a fresh database with a controllable clock.
// Default clock: 2026-03-15 18:00 UTC.
type harness struct {
	t    *testing.T
	srv  *gin.Engine
	svc  *service.Service
	pool *pgxpool.Pool
	mu   sync.Mutex
	now  time.Time
}

func newHarness(t *testing.T) *harness { return newHarnessWith(t, nil) }

func newHarnessWith(t *testing.T, tweak func(*config.Config)) *harness {
	t.Helper()
	gin.SetMode(gin.TestMode)
	h := &harness{t: t, pool: testutil.NewPool(t), now: time.Date(2026, 3, 15, 18, 0, 0, 0, time.UTC)}
	clock := func() time.Time {
		h.mu.Lock()
		defer h.mu.Unlock()
		return h.now
	}
	cfg := config.Config{
		JWTSecret: []byte(strings.Repeat("k", 32)), WebOrigin: "http://localhost:3000",
		AccessTTL: 15 * time.Minute, RefreshTTL: 30 * 24 * time.Hour, AuthRatePerMin: 10000,
	}
	if tweak != nil {
		tweak(&cfg)
	}
	h.svc = service.New(h.pool, auth.NewTokens(cfg.JWTSecret, cfg.AccessTTL, clock), cfg.RefreshTTL, clock)
	h.srv = httpapi.NewRouter(cfg, h.svc, slog.New(slog.DiscardHandler))
	return h
}

// setNow moves the clock. Access tokens expire 15 minutes after issue on this
// clock, so tests that jump in time must sign up (or log in) after the jump.
func (h *harness) setNow(t time.Time) {
	h.mu.Lock()
	h.now = t
	h.mu.Unlock()
}

type resp struct {
	Code    int
	Body    []byte
	Header  http.Header
	Cookies []*http.Cookie
}

func (h *harness) do(method, path, token string, body any, cookies ...*http.Cookie) resp {
	h.t.Helper()
	var r io.Reader
	if body != nil {
		if s, ok := body.(string); ok {
			r = strings.NewReader(s)
		} else {
			b, err := json.Marshal(body)
			if err != nil {
				h.t.Fatal(err)
			}
			r = bytes.NewReader(b)
		}
	}
	req := httptest.NewRequest(method, path, r)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	h.srv.ServeHTTP(rec, req)
	return resp{Code: rec.Code, Body: rec.Body.Bytes(), Header: rec.Header(), Cookies: rec.Result().Cookies()}
}

func expect[T any](t *testing.T, r resp, code int) T {
	t.Helper()
	if r.Code != code {
		t.Fatalf("status %d, want %d; body: %s", r.Code, code, r.Body)
	}
	var v T
	if len(r.Body) > 0 {
		if err := json.Unmarshal(r.Body, &v); err != nil {
			t.Fatalf("decode: %v; body: %s", err, r.Body)
		}
	}
	return v
}

type errBody struct {
	Error struct {
		Code   string            `json:"code"`
		Fields map[string]string `json:"fields"`
	} `json:"error"`
}

func errCode(r resp) string {
	var b errBody
	_ = json.Unmarshal(r.Body, &b)
	return b.Error.Code
}

func errFields(r resp) map[string]string {
	var b errBody
	_ = json.Unmarshal(r.Body, &b)
	return b.Error.Fields
}
func (h *harness) signup(email string) string {
	h.t.Helper()
	r := h.do("POST", "/api/v1/auth/register", "", M{
		"email": email, "password": "password123", "name": "Test User",
		"currency": "MXN", "locale": "es", "timezone": "UTC",
	})
	s := expect[struct {
		AccessToken string `json:"access_token"`
	}](h.t, r, 201)
	return s.AccessToken
}

// login returns a fresh access token (use after setNow moves the clock).
func (h *harness) login(email string) string {
	h.t.Helper()
	r := h.do("POST", "/api/v1/auth/login", "", M{"email": email, "password": "password123"})
	return expect[struct {
		AccessToken string `json:"access_token"`
	}](h.t, r, 200).AccessToken
}
