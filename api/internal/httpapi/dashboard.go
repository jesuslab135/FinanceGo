package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type budgetInput struct {
	MonthlyLimit int64 `json:"monthly_limit"`
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
