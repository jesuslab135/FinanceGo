package service

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"financego/internal/apperr"
	"financego/internal/auth"
	"financego/internal/store"
)

type User struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Currency  string    `json:"currency"`
	Locale    string    `json:"locale"`
	Timezone  string    `json:"timezone"`
	CreatedAt time.Time `json:"created_at"`
}

func toUser(u store.User) User {
	return User{ID: u.ID, Email: u.Email, Name: u.Name, Currency: u.Currency, Locale: u.Locale, Timezone: u.Timezone, CreatedAt: u.CreatedAt}
}

type RegisterInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Currency string `json:"currency"`
	Locale   string `json:"locale"`
	Timezone string `json:"timezone"`
}

type ProfileInput struct {
	Name     string `json:"name"`
	Currency string `json:"currency"`
	Locale   string `json:"locale"`
	Timezone string `json:"timezone"`
}

type Session struct {
	AccessToken  string `json:"access_token"`
	User         User   `json:"user"`
	RefreshToken string `json:"-"`
}

var (
	emailRe    = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
	currencyRe = regexp.MustCompile(`^[A-Z]{3}$`)
)

func checkProfile(v *apperr.V, p ProfileInput) {
	n := utf8.RuneCountInString(p.Name)
	v.Check(n >= 1 && n <= 80, "name", "must be 1-80 characters")
	v.Check(currencyRe.MatchString(p.Currency), "currency", "must be an ISO 4217 code such as MXN")
	v.Check(p.Locale == "es" || p.Locale == "en", "locale", "must be es or en")
	_, err := time.LoadLocation(p.Timezone)
	v.Check(p.Timezone != "" && p.Timezone != "Local" && err == nil, "timezone", "must be an IANA timezone such as America/Tijuana")
}

func invalidCredentials() error {
	return &apperr.Error{Status: http.StatusUnauthorized, Code: "invalid_credentials", Message: "email or password is incorrect"}
}

type defaultCategory struct{ name, kind, color, icon string }

func defaultCategories(locale string) []defaultCategory {
	es := []defaultCategory{
		{"Comida", "expense", "#f97316", "utensils"}, {"Transporte", "expense", "#0ea5e9", "car"},
		{"Vivienda", "expense", "#8b5cf6", "home"}, {"Servicios", "expense", "#14b8a6", "zap"},
		{"Salud", "expense", "#ef4444", "heart-pulse"}, {"Entretenimiento", "expense", "#ec4899", "film"},
		{"Suscripciones", "expense", "#6366f1", "repeat"}, {"Intereses y comisiones", "expense", "#b91c1c", "percent"},
		{"Otros", "expense", "#64748b", "tag"}, {"Salario", "income", "#22c55e", "briefcase"},
		{"Otros ingresos", "income", "#84cc16", "plus"},
	}
	if locale != "en" {
		return es
	}
	en := []string{"Food", "Transport", "Housing", "Utilities", "Health", "Entertainment", "Subscriptions",
		"Interest & fees", "Other", "Salary", "Other income"}
	out := make([]defaultCategory, len(es))
	for i, c := range es {
		c.name = en[i]
		out[i] = c
	}
	return out
}

func (s *Service) Register(ctx context.Context, in RegisterInput) (Session, error) {
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	var v apperr.V
	v.Check(len(in.Email) <= 254 && emailRe.MatchString(in.Email), "email", "must be a valid email address")
	pw := utf8.RuneCountInString(in.Password)
	v.Check(pw >= 8 && len(in.Password) <= 128, "password", "must be 8-128 characters")
	checkProfile(&v, ProfileInput{Name: in.Name, Currency: in.Currency, Locale: in.Locale, Timezone: in.Timezone})
	if err := v.Err(); err != nil {
		return Session{}, err
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return Session{}, err
	}
	var sess Session
	err = s.inTx(ctx, func(q *store.Queries) error {
		u, err := q.CreateUser(ctx, store.CreateUserParams{
			Email: in.Email, PasswordHash: hash, Name: in.Name, Currency: in.Currency, Locale: in.Locale, Timezone: in.Timezone,
		})
		if isUnique(err) {
			return apperr.Conflict("email_taken", "an account with this email already exists")
		}
		if err != nil {
			return err
		}
		for _, c := range defaultCategories(in.Locale) {
			if _, err := q.CreateCategory(ctx, store.CreateCategoryParams{UserID: u.ID, Name: c.name, Kind: c.kind, Color: c.color, Icon: c.icon}); err != nil {
				return err
			}
		}
		sess, err = s.newSession(ctx, q, u, "")
		return err
	})
	return sess, err
}

func (s *Service) newSession(ctx context.Context, q *store.Queries, u store.User, family string) (Session, error) {
	access, err := s.tokens.Issue(u.ID)
	if err != nil {
		return Session{}, err
	}
	raw, hash, err := auth.NewRefresh()
	if err != nil {
		return Session{}, err
	}
	if family == "" {
		if family, err = auth.NewFamilyID(); err != nil {
			return Session{}, err
		}
	}
	err = q.CreateRefreshToken(ctx, store.CreateRefreshTokenParams{
		UserID: u.ID, FamilyID: family, TokenHash: hash, ExpiresAt: s.now().Add(s.refreshTTL),
	})
	if err != nil {
		return Session{}, err
	}
	return Session{AccessToken: access, RefreshToken: raw, User: toUser(u)}, nil
}

func (s *Service) Login(ctx context.Context, email, password string) (Session, error) {
	u, err := s.q.GetUserByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
	if errors.Is(err, pgx.ErrNoRows) {
		auth.DummyVerify(password)
		return Session{}, invalidCredentials()
	}
	if err != nil {
		return Session{}, err
	}
	ok, err := auth.VerifyPassword(u.PasswordHash, password)
	if err != nil {
		return Session{}, err
	}
	if !ok {
		return Session{}, invalidCredentials()
	}
	return s.newSession(ctx, s.q, u, "")
}

// Refresh rotates a refresh token. Presenting an already-revoked token is
// treated as theft: the whole family is revoked (outside any rollback).
func (s *Service) Refresh(ctx context.Context, raw string) (Session, error) {
	if raw == "" {
		return Session{}, apperr.Unauthorized()
	}
	rt, err := s.q.GetRefreshToken(ctx, auth.HashRefresh(raw))
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, apperr.Unauthorized()
	}
	if err != nil {
		return Session{}, err
	}
	if rt.RevokedAt != nil {
		if err := s.q.RevokeRefreshFamily(ctx, rt.FamilyID); err != nil {
			return Session{}, err
		}
		return Session{}, apperr.Unauthorized()
	}
	if !s.now().Before(rt.ExpiresAt) {
		return Session{}, apperr.Unauthorized()
	}
	var sess Session
	err = s.inTx(ctx, func(q *store.Queries) error {
		n, err := q.RevokeRefreshToken(ctx, rt.ID)
		if err != nil {
			return err
		}
		if n == 0 { // a concurrent refresh won the race
			return &apperr.Error{Status: http.StatusUnauthorized, Code: "refresh_race", Message: "refresh already in progress"}
		}
		u, err := q.GetUser(ctx, rt.UserID)
		if err != nil {
			return err
		}
		sess, err = s.newSession(ctx, q, u, rt.FamilyID)
		return err
	})
	return sess, err
}

func (s *Service) Logout(ctx context.Context, raw string) error {
	if raw == "" {
		return nil
	}
	return s.q.RevokeRefreshByHash(ctx, auth.HashRefresh(raw))
}

func (s *Service) Me(ctx context.Context, a Actor) (User, error) {
	u, err := s.q.GetUser(ctx, a.UserID)
	if err != nil {
		return User{}, notFound(err)
	}
	return toUser(u), nil
}

func (s *Service) UpdateMe(ctx context.Context, a Actor, in ProfileInput) (User, error) {
	in.Name = strings.TrimSpace(in.Name)
	var v apperr.V
	checkProfile(&v, in)
	if err := v.Err(); err != nil {
		return User{}, err
	}
	u, err := s.q.UpdateUser(ctx, store.UpdateUserParams{ID: a.UserID, Name: in.Name, Currency: in.Currency, Locale: in.Locale, Timezone: in.Timezone})
	if err != nil {
		return User{}, notFound(err)
	}
	return toUser(u), nil
}
