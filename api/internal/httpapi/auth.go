package httpapi

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/service"
)

const refreshCookie = "fin_refresh"

func (h *handlers) setRefreshCookie(c *gin.Context, raw string, maxAge int) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(refreshCookie, raw, maxAge, "/api/v1/auth", "", h.cfg.CookieSecure, true)
}

func (h *handlers) startSession(c *gin.Context, code int, sess service.Session) {
	h.setRefreshCookie(c, sess.RefreshToken, int(h.cfg.RefreshTTL.Seconds()))
	c.JSON(code, sess)
}

type loginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// register godoc
// @Summary Create an account and start a session
// @Tags    auth
// @Accept  json
// @Produce json
// @Param   body body     service.RegisterInput true "account"
// @Success 201  {object} service.Session
// @Failure 409  {object} ErrorResponse
// @Failure 422  {object} ErrorResponse
// @Router  /auth/register [post]
func (h *handlers) register(c *gin.Context) {
	var in service.RegisterInput
	if !bind(c, &in) {
		return
	}
	sess, err := h.svc.Register(c.Request.Context(), in)
	if err != nil {
		fail(c, err)
		return
	}
	h.startSession(c, http.StatusCreated, sess)
}

// login godoc
// @Summary Log in with email and password
// @Tags    auth
// @Accept  json
// @Produce json
// @Param   body body     loginInput true "credentials"
// @Success 200  {object} service.Session
// @Failure 401  {object} ErrorResponse
// @Router  /auth/login [post]
func (h *handlers) login(c *gin.Context) {
	var in loginInput
	if !bind(c, &in) {
		return
	}
	sess, err := h.svc.Login(c.Request.Context(), in.Email, in.Password)
	if err != nil {
		fail(c, err)
		return
	}
	h.startSession(c, http.StatusOK, sess)
}

// refresh godoc
// @Summary Exchange the refresh cookie for a new access token (rotates the cookie)
// @Tags    auth
// @Produce json
// @Success 200 {object} service.Session
// @Failure 401 {object} ErrorResponse
// @Router  /auth/refresh [post]
func (h *handlers) refresh(c *gin.Context) {
	raw, _ := c.Cookie(refreshCookie)
	sess, err := h.svc.Refresh(c.Request.Context(), raw)
	if err != nil {
		// Clear the cookie only on a definitive rejection, not on 500s or a concurrent-rotation race.
		var ae *apperr.Error
		if errors.As(err, &ae) && ae.Status == http.StatusUnauthorized && ae.Code != "refresh_race" {
			h.setRefreshCookie(c, "", -1)
		}
		fail(c, err)
		return
	}
	h.startSession(c, http.StatusOK, sess)
}

// logout godoc
// @Summary Revoke the refresh cookie
// @Tags    auth
// @Success 204
// @Router  /auth/logout [post]
func (h *handlers) logout(c *gin.Context) {
	raw, _ := c.Cookie(refreshCookie)
	if err := h.svc.Logout(c.Request.Context(), raw); err != nil {
		fail(c, err)
		return
	}
	h.setRefreshCookie(c, "", -1)
	c.Status(http.StatusNoContent)
}

// getMe godoc
// @Summary  Current user profile
// @Tags     me
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} service.User
// @Router   /me [get]
func (h *handlers) getMe(c *gin.Context) {
	u, err := h.svc.Me(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, u)
}

// putMe godoc
// @Summary  Update profile (name, currency, locale, timezone)
// @Tags     me
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.ProfileInput true "profile"
// @Success  200  {object} service.User
// @Failure  422  {object} ErrorResponse
// @Router   /me [put]
func (h *handlers) putMe(c *gin.Context) {
	var in service.ProfileInput
	if !bind(c, &in) {
		return
	}
	u, err := h.svc.UpdateMe(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, u)
}
