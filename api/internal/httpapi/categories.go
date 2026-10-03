package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/service"
)

// listCategories godoc
// @Summary  List categories
// @Tags     categories
// @Produce  json
// @Security BearerAuth
// @Param    kind query string false "expense or income"
// @Success  200 {object} object{items=[]service.Category}
// @Router   /categories [get]
func (h *handlers) listCategories(c *gin.Context) {
	var kind *string
	if k := c.Query("kind"); k != "" {
		kind = &k
	}
	list, err := h.svc.ListCategories(c.Request.Context(), actorOf(c), kind)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createCategory godoc
// @Summary  Create a category
// @Tags     categories
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.CategoryInput true "category"
// @Success  201  {object} service.Category
// @Failure  409  {object} ErrorResponse
// @Failure  422  {object} ErrorResponse
// @Router   /categories [post]
func (h *handlers) createCategory(c *gin.Context) {
	var in service.CategoryInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateCategory(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updateCategory godoc
// @Summary  Update a category (kind cannot change)
// @Tags     categories
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                   true "category id"
// @Param    body body     service.CategoryInput true "category"
// @Success  200  {object} service.Category
// @Router   /categories/{id} [put]
func (h *handlers) updateCategory(c *gin.Context) {
	id, ok := pathID(c)
	var in service.CategoryInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateCategory(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteCategory godoc
// @Summary  Delete a category; if it is in use, pass reassign_to
// @Tags     categories
// @Security BearerAuth
// @Param    id          path  int true  "category id"
// @Param    reassign_to query int false "category that inherits all references"
// @Success  204
// @Failure  409 {object} ErrorResponse
// @Router   /categories/{id} [delete]
func (h *handlers) deleteCategory(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	to, ok := queryInt64(c, "reassign_to")
	if !ok {
		return
	}
	if err := h.svc.DeleteCategory(c.Request.Context(), actorOf(c), id, to); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
