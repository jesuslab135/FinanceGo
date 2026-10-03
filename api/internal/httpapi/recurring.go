package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/service"
)

// listIncomeSources godoc
// @Summary  List recurring income sources
// @Tags     recurring
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} object{items=[]service.IncomeSource}
// @Router   /income-sources [get]
func (h *handlers) listIncomeSources(c *gin.Context) {
	list, err := h.svc.ListIncomeSources(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createIncomeSource godoc
// @Summary  Create a recurring income source
// @Tags     recurring
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.IncomeSourceInput true "income source"
// @Success  201  {object} service.IncomeSource
// @Router   /income-sources [post]
func (h *handlers) createIncomeSource(c *gin.Context) {
	var in service.IncomeSourceInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateIncomeSource(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updateIncomeSource godoc
// @Summary  Replace an income source; pending, unedited rows from the current month on follow the change
// @Tags     recurring
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                       true "income source id"
// @Param    body body     service.IncomeSourceInput true "income source"
// @Success  200  {object} service.IncomeSource
// @Router   /income-sources/{id} [put]
func (h *handlers) updateIncomeSource(c *gin.Context) {
	id, ok := pathID(c)
	var in service.IncomeSourceInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateIncomeSource(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteIncomeSource godoc
// @Summary  Deactivate an income source; end_month becomes the current month (null if it has not started), so past months keep it
// @Tags     recurring
// @Produce  json
// @Security BearerAuth
// @Param    id path int true "income source id"
// @Success  200 {object} service.IncomeSource
// @Router   /income-sources/{id} [delete]
func (h *handlers) deleteIncomeSource(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.svc.DeactivateIncomeSource(c.Request.Context(), actorOf(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// listFixedPayments godoc
// @Summary  List recurring fixed payments
// @Tags     recurring
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} object{items=[]service.FixedPayment}
// @Router   /fixed-payments [get]
func (h *handlers) listFixedPayments(c *gin.Context) {
	list, err := h.svc.ListFixedPayments(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createFixedPayment godoc
// @Summary  Create a recurring fixed payment
// @Tags     recurring
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.FixedPaymentInput true "fixed payment"
// @Success  201  {object} service.FixedPayment
// @Router   /fixed-payments [post]
func (h *handlers) createFixedPayment(c *gin.Context) {
	var in service.FixedPaymentInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateFixedPayment(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updateFixedPayment godoc
// @Summary  Replace a fixed payment; pending, unedited rows from the current month on follow the change
// @Tags     recurring
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                       true "fixed payment id"
// @Param    body body     service.FixedPaymentInput true "fixed payment"
// @Success  200  {object} service.FixedPayment
// @Router   /fixed-payments/{id} [put]
func (h *handlers) updateFixedPayment(c *gin.Context) {
	id, ok := pathID(c)
	var in service.FixedPaymentInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateFixedPayment(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteFixedPayment godoc
// @Summary  Deactivate a fixed payment; end_month becomes the current month (null if it has not started), so past months keep it
// @Tags     recurring
// @Produce  json
// @Security BearerAuth
// @Param    id path int true "fixed payment id"
// @Success  200 {object} service.FixedPayment
// @Router   /fixed-payments/{id} [delete]
func (h *handlers) deleteFixedPayment(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.svc.DeactivateFixedPayment(c.Request.Context(), actorOf(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
