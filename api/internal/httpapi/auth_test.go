package httpapi_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"financego/internal/config"
)

func refreshCookieOf(t *testing.T, r resp) *http.Cookie {
	t.Helper()
	for _, c := range r.Cookies {
		if c.Name == "fin_refresh" {
			return c
		}
	}
	t.Fatalf("no fin_refresh cookie in %v", r.Cookies)
	return nil
}

func TestRegisterCreatesUserSessionAndDefaults(t *testing.T) {
	h := newHarness(t)
	r := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "  Ana@Example.com ", "password": "password123", "name": "Ana",
		"currency": "MXN", "locale": "es", "timezone": "America/Tijuana",
	})
	body := expect[struct {
		AccessToken string `json:"access_token"`
		User        struct {
			ID       int64  `json:"id"`
			Email    string `json:"email"`
			Timezone string `json:"timezone"`
		} `json:"user"`
	}](t, r, 201)
	if body.AccessToken == "" || body.User.Email != "ana@example.com" || body.User.Timezone != "America/Tijuana" {
		t.Fatalf("bad body %+v", body)
	}
	c := refreshCookieOf(t, r)
	if !c.HttpOnly || c.Path != "/api/v1/auth" || c.SameSite != http.SameSiteLaxMode || c.MaxAge <= 0 {
		t.Fatalf("bad cookie %+v", c)
	}
	var n int
	if err := h.pool.QueryRow(context.Background(), "SELECT count(*) FROM categories WHERE user_id=$1", body.User.ID).Scan(&n); err != nil || n != 11 {
		t.Fatalf("default categories = %d (%v), want 11", n, err)
	}

	dup := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "ANA@example.com", "password": "password123", "name": "Ana",
		"currency": "MXN", "locale": "es", "timezone": "UTC",
	})
	if dup.Code != 409 || errCode(dup) != "email_taken" {
		t.Fatalf("duplicate: %d %s", dup.Code, dup.Body)
	}
}

func TestRegisterValidation(t *testing.T) {
	h := newHarness(t)
	r := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "nope", "password": "short", "name": "", "currency": "mxn", "locale": "fr", "timezone": "Mars/Base",
	})
	if r.Code != 422 {
		t.Fatalf("status %d", r.Code)
	}
	f := errFields(r)
	for _, k := range []string{"email", "password", "name", "currency", "locale", "timezone"} {
		if f[k] == "" {
			t.Errorf("missing field error %q in %v", k, f)
		}
	}
	if bad := h.do("POST", "/api/v1/auth/register", "", "{not json"); bad.Code != 400 {
		t.Fatalf("malformed JSON: %d", bad.Code)
	}
}

func TestLoginAndMe(t *testing.T) {
	h := newHarness(t)
	h.signup("bo@example.com")

	wrong := h.do("POST", "/api/v1/auth/login", "", M{"email": "bo@example.com", "password": "wrongpass1"})
	if wrong.Code != 401 || errCode(wrong) != "invalid_credentials" {
		t.Fatalf("wrong password: %d %s", wrong.Code, wrong.Body)
	}
	unknown := h.do("POST", "/api/v1/auth/login", "", M{"email": "ghost@example.com", "password": "password123"})
	if unknown.Code != 401 || errCode(unknown) != "invalid_credentials" {
		t.Fatalf("unknown email: %d %s", unknown.Code, unknown.Body)
	}

	r := h.do("POST", "/api/v1/auth/login", "", M{"email": "BO@example.com", "password": "password123"})
	tok := expect[struct {
		AccessToken string `json:"access_token"`
	}](t, r, 200).AccessToken

	me := expect[M](t, h.do("GET", "/api/v1/me", tok, nil), 200)
	if me["email"] != "bo@example.com" || me["currency"] != "MXN" {
		t.Fatalf("me=%v", me)
	}
	if r := h.do("GET", "/api/v1/me", "", nil); r.Code != 401 {
		t.Fatalf("no token: %d", r.Code)
	}
	if r := h.do("GET", "/api/v1/me", "garbage", nil); r.Code != 401 {
		t.Fatalf("garbage token: %d", r.Code)
	}
	h.setNow(h.now.Add(16 * time.Minute))
	if r := h.do("GET", "/api/v1/me", tok, nil); r.Code != 401 {
		t.Fatalf("expired token: %d", r.Code)
	}
}

func TestUpdateMe(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("cy@example.com")
	u := expect[M](t, h.do("PUT", "/api/v1/me", tok, M{"name": "Cy", "currency": "USD", "locale": "en", "timezone": "America/Mexico_City"}), 200)
	if u["currency"] != "USD" || u["locale"] != "en" || u["timezone"] != "America/Mexico_City" {
		t.Fatalf("update=%v", u)
	}
	if r := h.do("PUT", "/api/v1/me", tok, M{"name": "Cy", "currency": "USD", "locale": "en", "timezone": "Local"}); r.Code != 422 {
		t.Fatalf("Local timezone accepted: %d", r.Code)
	}
}

func TestRefreshRotationAndReuse(t *testing.T) {
	h := newHarness(t)
	reg := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "di@example.com", "password": "password123", "name": "Di", "currency": "MXN", "locale": "es", "timezone": "UTC",
	})
	c1 := refreshCookieOf(t, reg)

	r := h.do("POST", "/api/v1/auth/refresh", "", nil, c1)
	body := expect[struct {
		AccessToken string `json:"access_token"`
	}](t, r, 200)
	c2 := refreshCookieOf(t, r)
	if body.AccessToken == "" || c2.Value == c1.Value {
		t.Fatal("refresh did not rotate")
	}

	// Reusing the rotated token after the 30s grace window revokes the whole family, including c2.
	h.setNow(h.now.Add(31 * time.Second))
	if r := h.do("POST", "/api/v1/auth/refresh", "", nil, c1); r.Code != 401 {
		t.Fatalf("reuse: %d", r.Code)
	}
	if r := h.do("POST", "/api/v1/auth/refresh", "", nil, c2); r.Code != 401 {
		t.Fatalf("family not revoked: %d", r.Code)
	}
	if r := h.do("POST", "/api/v1/auth/refresh", "", nil); r.Code != 401 {
		t.Fatalf("no cookie: %d", r.Code)
	}
}

func TestLogoutRevokesRefresh(t *testing.T) {
	h := newHarness(t)
	reg := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "ed@example.com", "password": "password123", "name": "Ed", "currency": "MXN", "locale": "es", "timezone": "UTC",
	})
	c := refreshCookieOf(t, reg)
	out := h.do("POST", "/api/v1/auth/logout", "", nil, c)
	if out.Code != 204 || refreshCookieOf(t, out).MaxAge >= 0 {
		t.Fatalf("logout: %d cookies=%v", out.Code, out.Cookies)
	}
	if r := h.do("POST", "/api/v1/auth/refresh", "", nil, c); r.Code != 401 {
		t.Fatalf("refresh after logout: %d", r.Code)
	}
}

func TestAuthRateLimit(t *testing.T) {
	h := newHarnessWith(t, func(c *config.Config) { c.AuthRatePerMin = 2 })
	body := M{"email": "x@example.com", "password": "password123"}
	h.do("POST", "/api/v1/auth/login", "", body)
	h.do("POST", "/api/v1/auth/login", "", body)
	if r := h.do("POST", "/api/v1/auth/login", "", body); r.Code != 429 || errCode(r) != "rate_limited" {
		t.Fatalf("3rd attempt: %d %s", r.Code, r.Body)
	}
}

func TestRefreshExpiredClearsCookie(t *testing.T) {
	h := newHarness(t)
	reg := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "fy@example.com", "password": "password123", "name": "Fy", "currency": "MXN", "locale": "es", "timezone": "UTC",
	})
	c := refreshCookieOf(t, reg)
	h.setNow(h.now.Add(31 * 24 * time.Hour))
	r := h.do("POST", "/api/v1/auth/refresh", "", nil, c)
	if r.Code != 401 || refreshCookieOf(t, r).MaxAge >= 0 {
		t.Fatalf("expired refresh: %d cookies=%v", r.Code, r.Cookies)
	}
}

// A second tab presenting the just-rotated token within 30s gets refresh_race
// without killing the session the first tab now holds.
func TestRefreshRaceGraceWindow(t *testing.T) {
	h := newHarness(t)
	reg := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "gi@example.com", "password": "password123", "name": "Gi", "currency": "MXN", "locale": "es", "timezone": "UTC",
	})
	c1 := refreshCookieOf(t, reg)
	r := h.do("POST", "/api/v1/auth/refresh", "", nil, c1)
	expect[M](t, r, 200)
	c2 := refreshCookieOf(t, r)

	h.setNow(h.now.Add(10 * time.Second))
	if r := h.do("POST", "/api/v1/auth/refresh", "", nil, c1); r.Code != 401 || errCode(r) != "refresh_race" {
		t.Fatalf("late second tab: %d %s", r.Code, r.Body)
	}
	if r := h.do("POST", "/api/v1/auth/refresh", "", nil, c2); r.Code != 200 {
		t.Fatalf("rotated cookie no longer refreshes: %d %s", r.Code, r.Body)
	}
}
