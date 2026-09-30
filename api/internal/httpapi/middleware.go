package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"

	"financego/internal/apperr"
	"financego/internal/service"
)

func requestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" || len(id) > 64 {
			b := make([]byte, 8)
			_, _ = rand.Read(b)
			id = hex.EncodeToString(b)
		}
		c.Set(requestIDKey, id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

// accessLog logs method, route, status and latency, never bodies or headers.
func accessLog(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Set(loggerKey, log)
		c.Next()
		log.Info("request", "method", c.Request.Method, "route", c.FullPath(), "status", c.Writer.Status(),
			"duration_ms", time.Since(start).Milliseconds(), "request_id", c.GetString(requestIDKey))
	}
}

func recoverer() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, rec any) { fail(c, fmt.Errorf("panic: %v", rec)) })
}

func securityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Referrer-Policy", "no-referrer")
		c.Next()
	}
}

func requireAuth(svc *service.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		tok, ok := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
		if !ok || tok == "" {
			fail(c, apperr.Unauthorized())
			return
		}
		a, err := svc.Authenticate(c.Request.Context(), tok)
		if err != nil {
			fail(c, err)
			return
		}
		c.Set(actorKey, a)
		c.Next()
	}
}

type ipLimiter struct {
	mu    sync.Mutex
	m     map[string]*rate.Limiter
	limit rate.Limit
	burst int
}

func (l *ipLimiter) get(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.m) > 10000 { // crude bound on memory; limits simply restart
		l.m = map[string]*rate.Limiter{}
	}
	lim, ok := l.m[ip]
	if !ok {
		lim = rate.NewLimiter(l.limit, l.burst)
		l.m[ip] = lim
	}
	return lim
}

// rateLimit allows perMin requests per minute per client IP (token bucket).
func rateLimit(perMin int) gin.HandlerFunc {
	l := &ipLimiter{m: map[string]*rate.Limiter{}, limit: rate.Limit(float64(perMin) / 60), burst: perMin}
	return func(c *gin.Context) {
		if !l.get(c.ClientIP()).Allow() {
			fail(c, apperr.RateLimited())
			return
		}
		c.Next()
	}
}

// maxBodyBytes caps request bodies; the largest legitimate JSON body is a few KiB.
const maxBodyBytes = 1 << 20

// bodyLimit makes reads past n bytes fail with *http.MaxBytesError (mapped to 413 by bind).
func bodyLimit(n int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, n)
		}
		c.Next()
	}
}
