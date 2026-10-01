package httpapi

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	_ "financego/docs"
	"financego/internal/apperr"
	"financego/internal/config"
	"financego/internal/service"
)

type handlers struct {
	svc *service.Service
	cfg config.Config
}

func NewRouter(cfg config.Config, svc *service.Service, log *slog.Logger) *gin.Engine {
	r := gin.New()
	// Entries were validated by config.LoadFrom; nil (the default) trusts no proxy.
	_ = r.SetTrustedProxies(cfg.TrustedProxies)
	r.Use(requestID(), accessLog(log), recoverer(), securityHeaders(), bodyLimit(maxBodyBytes), cors.New(cors.Config{
		AllowOrigins:     []string{cfg.WebOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Request-ID"},
		ExposeHeaders:    []string{"X-Request-ID", "Content-Disposition"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	r.NoRoute(func(c *gin.Context) { fail(c, apperr.NotFound()) })

	h := &handlers{svc: svc, cfg: cfg}
	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	r.GET("/readyz", func(c *gin.Context) {
		if err := svc.Ping(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "db unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.GET("/api/v1/docs/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	h.routes(r.Group("/api/v1"))
	return r
}

// routes is the single place endpoints are registered; each task adds its lines here.
func (h *handlers) routes(v1 *gin.RouterGroup) {
	authLimit := rateLimit(h.cfg.AuthRatePerMin)
	// Refresh and logout run on every page load, so they get their own, looser limiter
	// instead of sharing the credential-guessing budget of login/register.
	sessionLimit := rateLimit(max(h.cfg.AuthRatePerMin*12, 120))
	a := v1.Group("/auth")
	a.POST("/register", authLimit, h.register)
	a.POST("/login", authLimit, h.login)
	a.POST("/refresh", sessionLimit, h.refresh)
	a.POST("/logout", sessionLimit, h.logout)

	p := v1.Group("", requireAuth(h.svc))
	p.GET("/me", h.getMe)
	p.PUT("/me", h.putMe)

	p.GET("/categories", h.listCategories)
	p.POST("/categories", h.createCategory)
	p.PUT("/categories/:id", h.updateCategory)
	p.DELETE("/categories/:id", h.deleteCategory)

	p.GET("/payment-methods", h.listPaymentMethods)
	p.POST("/payment-methods", h.createPaymentMethod)
	p.GET("/payment-methods/:id", h.getPaymentMethod)
	p.PUT("/payment-methods/:id", h.updatePaymentMethod)
	p.DELETE("/payment-methods/:id", h.deletePaymentMethod)

	p.GET("/income-sources", h.listIncomeSources)
	p.POST("/income-sources", h.createIncomeSource)
	p.PUT("/income-sources/:id", h.updateIncomeSource)
	p.DELETE("/income-sources/:id", h.deleteIncomeSource)

	p.GET("/fixed-payments", h.listFixedPayments)
	p.POST("/fixed-payments", h.createFixedPayment)
	p.PUT("/fixed-payments/:id", h.updateFixedPayment)
	p.DELETE("/fixed-payments/:id", h.deleteFixedPayment)

	p.GET("/months/:month/entries", h.monthEntries)
	p.PUT("/entries/:id", h.updateEntry)

	p.GET("/expenses", h.listExpenses)
	p.POST("/expenses", h.createExpense)
	p.PUT("/expenses/:id", h.updateExpense)
	p.DELETE("/expenses/:id", h.deleteExpense)

	p.GET("/payment-methods/:id/statement", h.cardStatement)
	p.GET("/card-payments", h.listCardPayments)
	p.POST("/card-payments", h.createCardPayment)
	p.DELETE("/card-payments/:id", h.deleteCardPayment)
	p.GET("/installment-plans", h.listInstallmentPlans)
	p.POST("/installment-plans", h.createInstallmentPlan)
	p.PUT("/installment-plans/:id", h.updateInstallmentPlan)
	p.DELETE("/installment-plans/:id", h.cancelInstallmentPlan)

	p.GET("/dashboard/summary", h.dashboardSummary)
	p.GET("/category-budgets", h.listCategoryBudgets)
	p.PUT("/category-budgets/:id", h.putCategoryBudget)
	p.DELETE("/category-budgets/:id", h.deleteCategoryBudget)
	p.GET("/dashboard/series", h.dashboardSeries)
	p.GET("/dashboard/breakdown", h.dashboardBreakdown)
	p.GET("/dashboard/cards", h.dashboardCards)
	p.GET("/dashboard/upcoming", h.dashboardUpcoming)
	p.GET("/savings-accounts", h.listSavingsAccounts)
	p.POST("/savings-accounts", h.createSavingsAccount)
	p.GET("/savings-accounts/:id", h.getSavingsAccount)
	p.PUT("/savings-accounts/:id", h.updateSavingsAccount)
	p.DELETE("/savings-accounts/:id", h.deleteSavingsAccount)
	p.GET("/savings-accounts/:id/valuations", h.listValuations)
	p.PUT("/savings-accounts/:id/valuations/:date", h.putValuation)
	p.DELETE("/savings-accounts/:id/valuations/:date", h.deleteValuation)
	p.DELETE("/me", authLimit, h.deleteMe) // password check: same budget as login
	p.GET("/export/expenses.csv", h.exportExpenses)
	p.GET("/export/entries.csv", h.exportEntries)
}
