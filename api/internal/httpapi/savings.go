package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/service"
)

func pathDate(c *gin.Context) (time.Time, bool) {
	t, err := datex.ParseDate(c.Param("date"))
	if err != nil {
		fail(c, apperr.BadRequest("date: "+err.Error()))
		return time.Time{}, false
	}
	return t, true
}

// listSavingsAccounts godoc
// @Summary  List savings and investment accounts with computed balances
// @Tags     savings
// @Produce  json
// @Security BearerAuth
// @Param    include_archived query bool false "include archived accounts"
// @Success  200 {object} object{items=[]service.SavingsAccount}
// @Router   /savings-accounts [get]
func (h *handlers) listSavingsAccounts(c *gin.Context) {
	list, err := h.svc.ListSavingsAccounts(c.Request.Context(), actorOf(c), c.Query("include_archived") == "true")
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createSavingsAccount godoc
// @Summary  Create a savings or investment account
// @Tags     savings
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.SavingsAccountInput true "account"
// @Success  201  {object} service.SavingsAccount
// @Failure  409  {object} ErrorResponse
// @Failure  422  {object} ErrorResponse
// @Router   /savings-accounts [post]
func (h *handlers) createSavingsAccount(c *gin.Context) {
	var in service.SavingsAccountInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateSavingsAccount(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// getSavingsAccount godoc
// @Summary  One account with its goals
// @Tags     savings
// @Produce  json
// @Security BearerAuth
// @Param    id path int true "account id"
// @Success  200 {object} service.SavingsAccountDetail
// @Router   /savings-accounts/{id} [get]
func (h *handlers) getSavingsAccount(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.svc.GetSavingsAccount(c.Request.Context(), actorOf(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// updateSavingsAccount godoc
// @Summary  Replace an account (archived=true archives it; the opening is locked once it has history)
// @Tags     savings
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                         true "account id"
// @Param    body body     service.SavingsAccountInput true "account"
// @Success  200  {object} service.SavingsAccount
// @Router   /savings-accounts/{id} [put]
func (h *handlers) updateSavingsAccount(c *gin.Context) {
	id, ok := pathID(c)
	var in service.SavingsAccountInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateSavingsAccount(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteSavingsAccount godoc
// @Summary  Delete an account with no history (409 account_has_history otherwise)
// @Tags     savings
// @Security BearerAuth
// @Param    id path int true "account id"
// @Success  204
// @Failure  409 {object} ErrorResponse
// @Router   /savings-accounts/{id} [delete]
func (h *handlers) deleteSavingsAccount(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteSavingsAccount(c.Request.Context(), actorOf(c), id); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// listValuations godoc
// @Summary  An account's value updates, newest first
// @Tags     savings
// @Produce  json
// @Security BearerAuth
// @Param    id path int true "account id"
// @Success  200 {object} object{items=[]service.AccountValuation}
// @Router   /savings-accounts/{id}/valuations [get]
func (h *handlers) listValuations(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	list, err := h.svc.ListValuations(c.Request.Context(), actorOf(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// putValuation godoc
// @Summary  Record the account's value on a date (one per day; replaces)
// @Tags     savings
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                    true "account id"
// @Param    date path     string                 true "YYYY-MM-DD"
// @Param    body body     service.ValuationInput true "value"
// @Success  200  {object} service.AccountValuation
// @Router   /savings-accounts/{id}/valuations/{date} [put]
func (h *handlers) putValuation(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	on, ok := pathDate(c)
	var in service.ValuationInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.PutValuation(c.Request.Context(), actorOf(c), id, on, in.Value)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteValuation godoc
// @Summary  Delete a value update
// @Tags     savings
// @Security BearerAuth
// @Param    id   path int    true "account id"
// @Param    date path string true "YYYY-MM-DD"
// @Success  204
// @Router   /savings-accounts/{id}/valuations/{date} [delete]
func (h *handlers) deleteValuation(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	on, ok := pathDate(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteValuation(c.Request.Context(), actorOf(c), id, on); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
