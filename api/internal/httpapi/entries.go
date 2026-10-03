package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/service"
)

// monthEntries godoc
// @Summary  Income, fixed and installment rows for a month (generated on first read)
// @Tags     months
// @Produce  json
// @Security BearerAuth
// @Param    month path string true "YYYY-MM"
// @Success  200 {object} object{items=[]service.Entry}
// @Failure  422 {object} ErrorResponse
// @Router   /months/{month}/entries [get]
func (h *handlers) monthEntries(c *gin.Context) {
	m, err := datex.ParseMonth(c.Param("month"))
	if err != nil {
		fail(c, apperr.BadRequest(err.Error()))
		return
	}
	list, err := h.svc.MonthEntries(c.Request.Context(), actorOf(c), m)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// updateEntry godoc
// @Summary      Update one month's row (amount, status, settled_on, payment method)
// @Description  settled_on defaults to today; when given it must be between the month's first day minus 31 days and today plus 1 day.
// @Tags     months
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                 true "entry id"
// @Param    body body     service.EntryUpdate true "changes"
// @Success  200  {object} service.Entry
// @Router   /entries/{id} [put]
func (h *handlers) updateEntry(c *gin.Context) {
	id, ok := pathID(c)
	var in service.EntryUpdate
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateEntry(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
