package db_test

import (
	"context"
	"testing"

	"financego/internal/testutil"
)

func TestSchemaConstraints(t *testing.T) {
	pool := testutil.NewPool(t)
	ctx := context.Background()
	var uid int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (email,password_hash,name,currency,locale,timezone)
		VALUES ('a@b.c','h','A','MXN','es','UTC') RETURNING id`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	bad := map[string]string{
		"uppercase email": `INSERT INTO users (email,password_hash,name,currency,locale,timezone) VALUES ('X@b.c','h','A','MXN','es','UTC')`,
		"last4 letters":   `INSERT INTO payment_methods (user_id,nickname,type,last4) VALUES ($1,'d','debit','12ab')`,
		"credit no days":  `INSERT INTO payment_methods (user_id,nickname,type) VALUES ($1,'c','credit')`,
		"debit w/ limit":  `INSERT INTO payment_methods (user_id,nickname,type,credit_limit) VALUES ($1,'d','debit',100)`,
		"mid-month start": `INSERT INTO income_sources (user_id,name,amount,day_of_month,start_month) VALUES ($1,'s',1,1,'2026-01-15')`,
	}
	for name, q := range bad {
		var err error
		if name == "uppercase email" {
			_, err = pool.Exec(ctx, q)
		} else {
			_, err = pool.Exec(ctx, q, uid)
		}
		if err == nil {
			t.Errorf("%s: expected constraint violation", name)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO payment_methods (user_id,nickname,type,last4,statement_day,payment_due_day,opening_balance_date)
		VALUES ($1,'c','credit','4242',15,5,'2026-01-01')`, uid); err != nil {
		t.Fatalf("valid credit card rejected: %v", err)
	}
}
