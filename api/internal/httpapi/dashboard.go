package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
)

type budgetInput struct {
	MonthlyLimit int64 `json:"monthly_limit" validate:"required"`
}

// dashboardSummary godoc
// @Summary  Month summary: income, fixed, installments, spent, available, safe-to-spend, budgets
// @Tags     dashboard
// @Produce  json
// @Security BearerAuth
// @Param    month query string false "YYYY-MM (default: current month in the user's timezone)"
// @Success  200 {object} service.Summary
// @Router   /dashboard/summary [get]
func (h *handlers) dashboardSummary(c *gin.Context) {
	m, ok := queryMonth(c, "month")
	if !ok {
		return
	}
	out, err := h.svc.Summary(c.Request.Context(), actorOf(c), m)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// listCategoryBudgets godoc
// @Summary  List monthly category limits
// @Tags     budgets
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} object{items=[]service.CategoryBudget}
// @Router   /category-budgets [get]
func (h *handlers) listCategoryBudgets(c *gin.Context) {
	list, err := h.svc.ListCategoryBudgets(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// putCategoryBudget godoc
// @Summary  Set (create or replace) a category's monthly limit
// @Tags     budgets
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int         true "expense category id"
// @Param    body body     budgetInput true "limit in cents"
// @Success  200  {object} service.CategoryBudget
// @Router   /category-budgets/{id} [put]
func (h *handlers) putCategoryBudget(c *gin.Context) {
	id, ok := pathID(c)
	var in budgetInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.PutCategoryBudget(c.Request.Context(), actorOf(c), id, in.MonthlyLimit)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteCategoryBudget godoc
// @Summary  Remove a category's monthly limit
// @Tags     budgets
// @Security BearerAuth
// @Param    id path int true "category id"
// @Success  204
// @Router   /category-budgets/{id} [delete]
func (h *handlers) deleteCategoryBudget(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteCategoryBudget(c.Request.Context(), actorOf(c), id); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func requiredRange(c *gin.Context) (time.Time, time.Time, bool) {
	from, ok := queryDate(c, "from")
	if !ok {
		return time.Time{}, time.Time{}, false
	}
	to, ok := queryDate(c, "to")
	if !ok {
		return time.Time{}, time.Time{}, false
	}
	if from == nil || to == nil {
		fail(c, apperr.BadRequest("from and to are required (YYYY-MM-DD)"))
		return time.Time{}, time.Time{}, false
	}
	return *from, *to, true
}

// dashboardSeries godoc
// @Summary  Spending per day, ISO week or month (empty buckets are 0)
// @Tags     dashboard
// @Produce  json
// @Security BearerAuth
// @Param    period query string true "day, week or month"
// @Param    from   query string true "YYYY-MM-DD"
// @Param    to     query string true "YYYY-MM-DD"
// @Success  200 {object} object{items=[]service.SeriesPoint}
// @Router   /dashboard/series [get]
func (h *handlers) dashboardSeries(c *gin.Context) {
	from, to, ok := requiredRange(c)
	if !ok {
		return
	}
	list, err := h.svc.Series(c.Request.Context(), actorOf(c), c.Query("period"), from, to)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// dashboardBreakdown godoc
// @Summary  Spending grouped by category or payment method
// @Tags     dashboard
// @Produce  json
// @Security BearerAuth
// @Param    by   query string true "category or payment_method"
// @Param    from query string true "YYYY-MM-DD"
// @Param    to   query string true "YYYY-MM-DD"
// @Success  200 {object} object{items=[]service.BreakdownItem}
// @Router   /dashboard/breakdown [get]
func (h *handlers) dashboardBreakdown(c *gin.Context) {
	from, to, ok := requiredRange(c)
	if !ok {
		return
	}
	list, err := h.svc.Breakdown(c.Request.Context(), actorOf(c), c.Query("by"), from, to)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// dashboardCards godoc
// @Summary  Debt summary per active credit card (inactive cards too while they carry a balance)
// @Tags     dashboard
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} object{items=[]service.CardSummary}
// @Router   /dashboard/cards [get]
func (h *handlers) dashboardCards(c *gin.Context) {
	list, err := h.svc.CardsOverview(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// dashboardUpcoming godoc
// @Summary  Upcoming fixed payments and card payment due dates
// @Tags     dashboard
// @Produce  json
// @Security BearerAuth
// @Param    days query int false "7-60, default 7"
// @Success  200 {object} object{items=[]service.UpcomingItem}
// @Router   /dashboard/upcoming [get]
func (h *handlers) dashboardUpcoming(c *gin.Context) {
	days := 7
	if v := c.Query("days"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			fail(c, apperr.BadRequest("days: must be an integer"))
			return
		}
		days = n
	}
	list, err := h.svc.Upcoming(c.Request.Context(), actorOf(c), days)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}
