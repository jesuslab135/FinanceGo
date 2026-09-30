// Package testutil provides integration-test helpers backed by a real PostgreSQL.
package testutil

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"financego/internal/db"
)

const templateDB = "fin_template"

var (
	setupOnce sync.Once
	adminDSN  string
	setupErr  error
	counter   atomic.Int64
)

func withDB(dsn, name string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		panic(err)
	}
	u.Path = "/" + name
	return u.String()
}

func setup() {
	ctx := context.Background()
	ctr, err := postgres.Run(ctx, "postgres:17-alpine",
		postgres.WithDatabase("postgres"),
		postgres.WithUsername("fin"),
		postgres.WithPassword("fin"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		setupErr = err
		return
	}
	if adminDSN, err = ctr.ConnectionString(ctx, "sslmode=disable"); err != nil {
		setupErr = err
		return
	}
	conn, err := pgx.Connect(ctx, adminDSN)
	if err != nil {
		setupErr = err
		return
	}
	defer conn.Close(ctx)
	if _, err = conn.Exec(ctx, "CREATE DATABASE "+templateDB); err != nil {
		setupErr = err
		return
	}
	setupErr = db.Migrate(ctx, withDB(adminDSN, templateDB))
}

// NewPool returns a pool on a brand-new database cloned from the migrated
// template. Each test gets its own database, so tests may run in parallel.
func NewPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test: needs Docker")
	}
	setupOnce.Do(setup)
	if setupErr != nil {
		t.Fatalf("postgres test container: %v", setupErr)
	}
	ctx := context.Background()
	name := fmt.Sprintf("t_%d_%d", os.Getpid(), counter.Add(1))
	conn, err := pgx.Connect(ctx, adminDSN)
	if err != nil {
		t.Fatal(err)
	}
	_, err = conn.Exec(ctx, fmt.Sprintf("CREATE DATABASE %s TEMPLATE %s", name, templateDB))
	conn.Close(ctx)
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, withDB(adminDSN, name))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}
