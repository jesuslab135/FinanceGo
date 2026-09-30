package httpapi_test

import (
	"strings"
	"testing"
)

func TestSwaggerServed(t *testing.T) {
	h := newHarness(t)
	r := h.do("GET", "/api/v1/docs/doc.json", "", nil)
	if r.Code != 200 || !strings.Contains(string(r.Body), `"/dashboard/summary"`) {
		t.Fatalf("docs: %d %.200s", r.Code, r.Body)
	}
}
