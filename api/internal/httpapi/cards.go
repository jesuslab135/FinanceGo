package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/service"
)

// listCardPayments godoc
// @Summary  List payments made to credit cards
// @Tags     cards
// @Produce  json
// @Security BearerAuth
// @Param    payment_method_id query int    false "card"
// @Param    from              query string false "YYYY-MM-DD"
// @Param    to                query string false "YYYY-MM-DD"
// @Success  200 {object} object{items=[]service.CardPayment}
// @Router   /card-payments [get]
func (h *handlers) listCardPayments(c *gin.Context) {
	pm, ok := queryInt64(c, "payment_method_id")
	if !ok {
		return
	}
	from, ok := queryDate(c, "from")
	if !ok {
		return
	}
	to, ok := queryDate(c, "to")
	if !ok {
		return
	}
	list, err := h.svc.ListCardPayments(c.Request.Context(), actorOf(c), pm, from, to)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createCardPayment godoc
// @Summary  Record a payment to a credit card (a transfer, not spending)
// @Tags     cards
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.CardPaymentInput true "payment"
// @Success  201  {object} service.CardPayment
// @Router   /card-payments [post]
func (h *handlers) createCardPayment(c *gin.Context) {
	var in service.CardPaymentInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateCardPayment(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// deleteCardPayment godoc
// @Summary  Delete a card payment
// @Tags     cards
// @Security BearerAuth
// @Param    id path int true "card payment id"
// @Success  204
// @Router   /card-payments/{id} [delete]
func (h *handlers) deleteCardPayment(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteCardPayment(c.Request.Context(), actorOf(c), id); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// listInstallmentPlans godoc
// @Summary  List MSI (meses sin intereses) plans
// @Tags     cards
// @Produce  json
// @Security BearerAuth
// @Param    payment_method_id query int  false "card"
// @Param    active_only       query bool false "exclude cancelled plans"
// @Success  200 {object} object{items=[]service.InstallmentPlan}
// @Router   /installment-plans [get]
func (h *handlers) listInstallmentPlans(c *gin.Context) {
	pm, ok := queryInt64(c, "payment_method_id")
	if !ok {
		return
	}
	list, err := h.svc.ListInstallmentPlans(c.Request.Context(), actorOf(c), pm, c.Query("active_only") == "true")
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createInstallmentPlan godoc
// @Summary  Create an MSI plan on a credit card
// @Tags     cards
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.InstallmentPlanInput true "plan"
// @Success  201  {object} service.InstallmentPlan
// @Router   /installment-plans [post]
func (h *handlers) createInstallmentPlan(c *gin.Context) {
	var in service.InstallmentPlanInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateInstallmentPlan(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updateInstallmentPlan godoc
// @Summary  Replace an MSI plan (only description/category once billing started)
// @Tags     cards
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                          true "plan id"
// @Param    body body     service.InstallmentPlanInput true "plan"
// @Success  200  {object} service.InstallmentPlan
// @Failure  409  {object} ErrorResponse
// @Router   /installment-plans/{id} [put]
func (h *handlers) updateInstallmentPlan(c *gin.Context) {
	id, ok := pathID(c)
	var in service.InstallmentPlanInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateInstallmentPlan(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// cancelInstallmentPlan godoc
// @Summary  Cancel an MSI plan (refund/cancellation); unbilled installments leave the debt
// @Tags     cards
// @Produce  json
// @Security BearerAuth
// @Param    id path int true "plan id"
// @Success  200 {object} service.InstallmentPlan
// @Router   /installment-plans/{id} [delete]
func (h *handlers) cancelInstallmentPlan(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.svc.CancelInstallmentPlan(c.Request.Context(), actorOf(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// cardStatement godoc
// @Summary  Credit-card statement for a cycle (default: the one currently due)
// @Tags     cards
// @Produce  json
// @Security BearerAuth
// @Param    id    path  int    true  "card id"
// @Param    cycle query string false "YYYY-MM"
// @Success  200 {object} service.Statement
// @Failure  422 {object} ErrorResponse
// @Router   /payment-methods/{id}/statement [get]
func (h *handlers) cardStatement(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var cycle *time.Time
	if v := c.Query("cycle"); v != "" {
		m, err := datex.ParseMonth(v)
		if err != nil {
			fail(c, apperr.BadRequest("cycle: "+err.Error()))
			return
		}
		cycle = &m
	}
	out, err := h.svc.CardStatement(c.Request.Context(), actorOf(c), id, cycle)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
