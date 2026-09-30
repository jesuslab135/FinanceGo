// Package db applies database migrations.
package db

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver "pgx"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/database"

	"financego/migrations"
)

// Migrate applies all pending up-migrations to the database at dsn.
func Migrate(ctx context.Context, dsn string) error {
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	p, err := goose.NewProvider(database.DialectPostgres, sqlDB, migrations.FS)
	if err != nil {
		return err
	}
	if _, err := p.Up(ctx); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	return nil
}
