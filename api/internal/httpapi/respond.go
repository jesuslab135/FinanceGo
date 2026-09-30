// Package httpapi exposes the service over HTTP with Gin.
package httpapi

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/service"
)

const (
	actorKey     = "actor"
	requestIDKey = "request_id"
	loggerKey    = "logger"
)

// ErrorResponse is the body of every non-2xx response.
type ErrorResponse struct {
	Error *apperr.Error `json:"error"`
}

func loggerOf(c *gin.Context) *slog.Logger {
	if l, ok := c.Get(loggerKey); ok {
		return l.(*slog.Logger)
	}
	return slog.Default()
}

// fail writes err as a JSON error; unknown errors become a logged 500.
func fail(c *gin.Context, err error) {
	var ae *apperr.Error
	if !errors.As(err, &ae) {
		rid := c.GetString(requestIDKey)
		loggerOf(c).Error("internal error", "err", err, "request_id", rid)
		ae = &apperr.Error{Status: 500, Code: "internal", Message: fmt.Sprintf("internal error (request %s)", rid)}
	}
	c.AbortWithStatusJSON(ae.Status, ErrorResponse{Error: ae})
}

func bind(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		if mbe := (*http.MaxBytesError)(nil); errors.As(err, &mbe) {
			fail(c, &apperr.Error{Status: http.StatusRequestEntityTooLarge, Code: "payload_too_large",
				Message: fmt.Sprintf("request body exceeds %d bytes", mbe.Limit)})
			return false
		}
		fail(c, apperr.BadRequest("invalid JSON body: "+err.Error()))
		return false
	}
	return true
}

func pathID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		fail(c, apperr.NotFound())
		return 0, false
	}
	return id, true
}

func actorOf(c *gin.Context) service.Actor { return c.MustGet(actorKey).(service.Actor) }

func queryDate(c *gin.Context, key string) (*time.Time, bool) {
	v := c.Query(key)
	if v == "" {
		return nil, true
	}
	t, err := datex.ParseDate(v)
	if err != nil {
		fail(c, apperr.BadRequest(key+": "+err.Error()))
		return nil, false
	}
	return &t, true
}

func queryInt64(c *gin.Context, key string) (*int64, bool) {
	v := c.Query(key)
	if v == "" {
		return nil, true
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		fail(c, apperr.BadRequest(key+": must be an integer"))
		return nil, false
	}
	return &n, true
}

func items[T any](list []T) gin.H {
	if list == nil {
		list = []T{}
	}
	return gin.H{"items": list}
}

func queryMonth(c *gin.Context, key string) (*time.Time, bool) {
	v := c.Query(key)
	if v == "" {
		return nil, true
	}
	t, err := datex.ParseMonth(v)
	if err != nil {
		fail(c, apperr.BadRequest(key+": "+err.Error()))
		return nil, false
	}
	return &t, true
}
