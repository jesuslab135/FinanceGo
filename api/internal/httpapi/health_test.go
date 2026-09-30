package httpapi_test

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHealthAndErrors(t *testing.T) {
	h := newHarness(t)
	expect[M](t, h.do("GET", "/healthz", "", nil), 200)
	expect[M](t, h.do("GET", "/readyz", "", nil), 200)

	r := h.do("GET", "/api/v1/nope", "", nil)
	if r.Code != 404 || errCode(r) != "not_found" {
		t.Fatalf("unknown route: %d %s", r.Code, r.Body)
	}
	if r.Header.Get("X-Request-ID") == "" || r.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("missing request id or security header")
	}

	h.srv.GET("/boom", func(*gin.Context) { panic("kaboom") })
	r = h.do("GET", "/boom", "", nil)
	if r.Code != 500 || errCode(r) != "internal" {
		t.Fatalf("panic not converted: %d %s", r.Code, r.Body)
	}
}
