package httpapi_test

import (
	"net/http/httptest"
	"strings"
	"testing"

	"financego/internal/config"
)

// A 2 MiB JSON body (valid, with an ignored junk field) is refused, not bound.
func TestBodyLimit(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("big@example.com")
	junk := strings.Repeat("a", 2<<20)
	r := h.do("POST", "/api/v1/categories", tok, M{"name": "Big", "kind": "expense", "junk": junk})
	if r.Code != 413 || errCode(r) != "payload_too_large" {
		t.Fatalf("2 MiB body: %d %.200s", r.Code, r.Body)
	}
	// Small bodies still work.
	expect[category](t, h.do("POST", "/api/v1/categories", tok, M{"name": "Small", "kind": "expense"}), 201)
}

// DELETE /me shares the auth rate limiter (password guessing on a stolen token).
func TestDeleteMeRateLimited(t *testing.T) {
	h := newHarnessWith(t, func(c *config.Config) { c.AuthRatePerMin = 3 })
	tok := h.signup("rl@example.com") // consumes one auth token
	codes := []int{}
	for range 3 {
		codes = append(codes, h.do("DELETE", "/api/v1/me", tok, M{"password": "wrong-password"}).Code)
	}
	if codes[len(codes)-1] != 429 {
		t.Fatalf("DELETE /me not rate limited: %v", codes)
	}
}

// With TRUSTED_PROXIES set, X-Forwarded-For from that proxy identifies the client.
func TestTrustedProxies(t *testing.T) {
	loginFrom := func(h *harness, xff string) int {
		req := httptest.NewRequest("POST", "/api/v1/auth/login", strings.NewReader(`{"email":"x@example.com","password":"password123"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-For", xff) // httptest RemoteAddr is 192.0.2.1
		rec := httptest.NewRecorder()
		h.srv.ServeHTTP(rec, req)
		return rec.Code
	}
	trusted := newHarnessWith(t, func(c *config.Config) { c.AuthRatePerMin = 1; c.TrustedProxies = []string{"192.0.2.1"} })
	loginFrom(trusted, "203.0.113.1")
	if code := loginFrom(trusted, "203.0.113.2"); code == 429 {
		t.Fatal("distinct forwarded clients behind a trusted proxy share a bucket")
	}
	untrusted := newHarnessWith(t, func(c *config.Config) { c.AuthRatePerMin = 1 })
	loginFrom(untrusted, "203.0.113.1")
	if code := loginFrom(untrusted, "203.0.113.2"); code != 429 {
		t.Fatalf("X-Forwarded-For honored without trusted proxies: %d", code)
	}
}
