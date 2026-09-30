package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"time"

	"financego/internal/apperr"
	"financego/internal/auth"
	"financego/internal/store"
)

// FormatCents renders cents as a plain decimal ("1234.50"), the format spreadsheets import cleanly.
func FormatCents(c int64) string {
	sign := ""
	if c < 0 {
		sign, c = "-", -c
	}
	return fmt.Sprintf("%s%d.%02d", sign, c/100, c%100)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func checkExportRange(from, to time.Time) error {
	return checkRange(from, to, 5*366+1)
}

// newCSV writes a UTF-8 BOM (so Excel detects the encoding) and returns a writer.
func newCSV(w io.Writer, header ...string) (*csv.Writer, error) {
	if _, err := io.WriteString(w, "\ufeff"); err != nil {
		return nil, err
	}
	cw := csv.NewWriter(w)
	return cw, cw.Write(header)
}

func (s *Service) ExportExpensesCSV(ctx context.Context, a Actor, from, to time.Time, w io.Writer) error {
	if err := checkExportRange(from, to); err != nil {
		return err
	}
	rows, err := s.q.ExportExpenses(ctx, store.ExportExpensesParams{UserID: a.UserID, FromDate: from, ToDate: to})
	if err != nil {
		return err
	}
	cw, err := newCSV(w, "date", "category", "payment_method", "description", "amount")
	if err != nil {
		return err
	}
	for _, r := range rows {
		if err := cw.Write([]string{r.SpentOn.Format(time.DateOnly), r.Category, deref(r.PaymentMethod), r.Description, FormatCents(r.Amount)}); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

func (s *Service) ExportEntriesCSV(ctx context.Context, a Actor, from, to time.Time, w io.Writer) error {
	if err := checkExportRange(from, to); err != nil {
		return err
	}
	rows, err := s.q.ExportEntries(ctx, store.ExportEntriesParams{UserID: a.UserID, FromDate: from, ToDate: to})
	if err != nil {
		return err
	}
	cw, err := newCSV(w, "month", "kind", "name", "category", "payment_method", "due_date", "status", "amount")
	if err != nil {
		return err
	}
	for _, r := range rows {
		if err := cw.Write([]string{r.Month.Format("2006-01"), r.Kind, r.Name, deref(r.Category), deref(r.PaymentMethod),
			r.DueDate.Format(time.DateOnly), r.Status, FormatCents(r.Amount)}); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

// DeleteAccount permanently removes the user and, by cascade, all their data.
func (s *Service) DeleteAccount(ctx context.Context, a Actor, password string) error {
	u, err := s.q.GetUser(ctx, a.UserID)
	if err != nil {
		return notFound(err)
	}
	ok, err := auth.VerifyPassword(u.PasswordHash, password)
	if err != nil {
		return err
	}
	if !ok {
		return apperr.Validation(map[string]string{"password": "is incorrect"})
	}
	_, err = s.q.DeleteUser(ctx, a.UserID)
	return err
}
