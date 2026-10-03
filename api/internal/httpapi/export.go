package httpapi

import (
	"bytes"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func (h *handlers) sendCSV(c *gin.Context, name string, write func(from, to time.Time, buf *bytes.Buffer) error) {
	from, to, ok := requiredRange(c)
	if !ok {
		return
	}
	var buf bytes.Buffer
	if err := write(from, to, &buf); err != nil {
		fail(c, err)
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s_%s_%s.csv"`, name, from.Format(time.DateOnly), to.Format(time.DateOnly)))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
}

// exportExpenses godoc
// @Summary  Download expenses as CSV
// @Tags     export
// @Produce  text/csv
// @Security BearerAuth
// @Param    from query string true "YYYY-MM-DD"
// @Param    to   query string true "YYYY-MM-DD"
// @Success  200 {file} file
// @Router   /export/expenses.csv [get]
func (h *handlers) exportExpenses(c *gin.Context) {
	h.sendCSV(c, "expenses", func(from, to time.Time, buf *bytes.Buffer) error {
		return h.svc.ExportExpensesCSV(c.Request.Context(), actorOf(c), from, to, buf)
	})
}

// exportEntries godoc
// @Summary  Download income, fixed and installment rows as CSV
// @Tags     export
// @Produce  text/csv
// @Security BearerAuth
// @Param    from query string true "YYYY-MM-DD"
// @Param    to   query string true "YYYY-MM-DD"
// @Success  200 {file} file
// @Router   /export/entries.csv [get]
func (h *handlers) exportEntries(c *gin.Context) {
	h.sendCSV(c, "entries", func(from, to time.Time, buf *bytes.Buffer) error {
		return h.svc.ExportEntriesCSV(c.Request.Context(), actorOf(c), from, to, buf)
	})
}

// exportSavings godoc
// @Summary  Download savings openings, movements and value updates as CSV
// @Tags     export
// @Produce  text/csv
// @Security BearerAuth
// @Param    from query string true "YYYY-MM-DD"
// @Param    to   query string true "YYYY-MM-DD"
// @Success  200 {file} file
// @Router   /export/savings.csv [get]
func (h *handlers) exportSavings(c *gin.Context) {
	h.sendCSV(c, "savings", func(from, to time.Time, buf *bytes.Buffer) error {
		return h.svc.ExportSavingsCSV(c.Request.Context(), actorOf(c), from, to, buf)
	})
}
