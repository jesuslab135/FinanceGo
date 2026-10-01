// Package service holds the business rules; handlers call it, it calls the store.
package service

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"financego/internal/apperr"
	"financego/internal/auth"
	"financego/internal/datex"
	"financego/internal/store"
)

type Service struct {
	pool       *pgxpool.Pool
	q          *store.Queries
	tokens     *auth.Tokens
	refreshTTL time.Duration
	now        func() time.Time
	udiValue   float64
}

func New(pool *pgxpool.Pool, tokens *auth.Tokens, refreshTTL time.Duration, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{pool: pool, q: store.New(pool), tokens: tokens, refreshTTL: refreshTTL, now: now, udiValue: 8.70}
}

func (s *Service) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

func (s *Service) inTx(ctx context.Context, fn func(q *store.Queries) error) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error { return fn(s.q.WithTx(tx)) })
}

// Actor is the authenticated user making a request.
type Actor struct {
	UserID int64
	Loc    *time.Location
}

// Today is the actor's local calendar date.
func (a Actor) Today(now time.Time) time.Time { return datex.Today(now, a.Loc) }

func (s *Service) today(a Actor) time.Time { return a.Today(s.now()) }

// SetUDIValue sets pesos per UDI for the deposit-insurance limits (config UDI_VALUE).
func (s *Service) SetUDIValue(v float64) { s.udiValue = v }

func (s *Service) Authenticate(ctx context.Context, token string) (Actor, error) {
	id, err := s.tokens.Parse(token)
	if err != nil {
		return Actor{}, apperr.Unauthorized()
	}
	u, err := s.q.GetUser(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Actor{}, apperr.Unauthorized()
	}
	if err != nil {
		return Actor{}, err
	}
	return Actor{UserID: u.ID, Loc: loadLoc(u.Timezone)}, nil
}

func loadLoc(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

// notFound maps "no rows" to a 404 and passes other errors through.
func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.NotFound()
	}
	return err
}

func isUnique(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}
