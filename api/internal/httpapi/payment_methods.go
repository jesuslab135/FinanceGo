package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/service"
)

// listPaymentMethods godoc
// @Summary  List payment methods (cards are reference data: last 4 digits only)
// @Tags     payment-methods
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} object{items=[]service.PaymentMethod}
// @Router   /payment-methods [get]
func (h *handlers) listPaymentMethods(c *gin.Context) {
	list, err := h.svc.ListPaymentMethods(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// getPaymentMethod godoc
// @Summary  Get a payment method
// @Tags     payment-methods
// @Produce  json
// @Security BearerAuth
// @Param    id path int true "payment method id"
// @Success  200 {object} service.PaymentMethod
// @Router   /payment-methods/{id} [get]
func (h *handlers) getPaymentMethod(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.svc.GetPaymentMethod(c.Request.Context(), actorOf(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// createPaymentMethod godoc
// @Summary  Create a payment method
// @Tags     payment-methods
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.PaymentMethodInput true "payment method"
// @Success  201  {object} service.PaymentMethod
// @Failure  422  {object} ErrorResponse
// @Router   /payment-methods [post]
func (h *handlers) createPaymentMethod(c *gin.Context) {
	var in service.PaymentMethodInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreatePaymentMethod(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updatePaymentMethod godoc
// @Summary  Replace a payment method's editable fields (type cannot change)
// @Tags     payment-methods
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                        true "payment method id"
// @Param    body body     service.PaymentMethodInput true "payment method"
// @Success  200  {object} service.PaymentMethod
// @Router   /payment-methods/{id} [put]
func (h *handlers) updatePaymentMethod(c *gin.Context) {
	id, ok := pathID(c)
	var in service.PaymentMethodInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdatePaymentMethod(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deletePaymentMethod godoc
// @Summary  Delete an unused payment method (deactivate used ones instead)
// @Tags     payment-methods
// @Security BearerAuth
// @Param    id path int true "payment method id"
// @Success  204
// @Failure  409 {object} ErrorResponse
// @Router   /payment-methods/{id} [delete]
func (h *handlers) deletePaymentMethod(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.DeletePaymentMethod(c.Request.Context(), actorOf(c), id); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
