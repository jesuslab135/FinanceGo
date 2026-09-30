package httpapi

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/service"
)

// listExpenses godoc
// @Summary  List expenses, newest first, cursor-paginated
// @Tags     expenses
// @Produce  json
// @Security BearerAuth
// @Param    from              query string false "YYYY-MM-DD"
// @Param    to                query string false "YYYY-MM-DD"
// @Param    category_id       query int    false "category"
// @Param    payment_method_id query int    false "payment method"
// @Param    q                 query string false "search in description"
// @Param    cursor            query string false "next_cursor from the previous page"
// @Param    limit             query int    false "1-200, default 50"
// @Success  200 {object} service.ExpensePage
// @Router   /expenses [get]
func (h *handlers) listExpenses(c *gin.Context) {
	var f service.ExpenseFilter
	var ok bool
	if f.From, ok = queryDate(c, "from"); !ok {
		return
	}
	if f.To, ok = queryDate(c, "to"); !ok {
		return
	}
	if f.CategoryID, ok = queryInt64(c, "category_id"); !ok {
		return
	}
	if f.PaymentMethodID, ok = queryInt64(c, "payment_method_id"); !ok {
		return
	}
	f.Q, f.Cursor = c.Query("q"), c.Query("cursor")
	if l := c.Query("limit"); l != "" {
		n, err := strconv.Atoi(l)
		if err != nil {
			fail(c, apperr.BadRequest("limit: must be an integer"))
			return
		}
		f.Limit = n
	}
	page, err := h.svc.ListExpenses(c.Request.Context(), actorOf(c), f)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, page)
}

// createExpense godoc
// @Summary  Record an expense
// @Tags     expenses
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.ExpenseInput true "expense"
// @Success  201  {object} service.Expense
// @Failure  422  {object} ErrorResponse
// @Router   /expenses [post]
func (h *handlers) createExpense(c *gin.Context) {
	var in service.ExpenseInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateExpense(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updateExpense godoc
// @Summary  Replace an expense
// @Tags     expenses
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                  true "expense id"
// @Param    body body     service.ExpenseInput true "expense"
// @Success  200  {object} service.Expense
// @Router   /expenses/{id} [put]
func (h *handlers) updateExpense(c *gin.Context) {
	id, ok := pathID(c)
	var in service.ExpenseInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateExpense(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteExpense godoc
// @Summary  Delete an expense
// @Tags     expenses
// @Security BearerAuth
// @Param    id path int true "expense id"
// @Success  204
// @Router   /expenses/{id} [delete]
func (h *handlers) deleteExpense(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteExpense(c.Request.Context(), actorOf(c), id); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
