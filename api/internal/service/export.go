package service

import (
	"cmp"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"slices"
	"strings"
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
		if err := cw.Write([]string{r.SpentOn.Format(time.DateOnly), safeCell(r.Category), safeCell(deref(r.PaymentMethod)), safeCell(r.Description), FormatCents(r.Amount)}); err != nil {
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
		if err := cw.Write([]string{r.Month.Format("2006-01"), r.Kind, safeCell(r.Name), safeCell(deref(r.Category)), safeCell(deref(r.PaymentMethod)),
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

// safeCell defuses spreadsheet formula injection: text starting with a formula
// trigger gets a leading apostrophe so Excel/Sheets treat it as plain text.
func safeCell(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

// ExportSavingsCSV writes one row per savings event in [from, to]: openings, movements (a transfer
// becomes transfer_out on its account and transfer_in on the destination) and valuations.
func (s *Service) ExportSavingsCSV(ctx context.Context, a Actor, from, to time.Time, w io.Writer) error {
	if err := checkExportRange(from, to); err != nil {
		return err
	}
	d, err := s.loadSavings(ctx, s.q, a.UserID)
	if err != nil {
		return err
	}
	moves, err := s.q.ListAccountMovementsForUser(ctx, a.UserID) // for the notes
	if err != nil {
		return err
	}
	accName := map[int64]string{}
	for _, acc := range d.accounts {
		accName[acc.ID] = acc.Name
	}
	goalName := map[int64]string{}
	for _, g := range d.goals {
		goalName[g.ID] = g.Name
	}
	type row struct {
		on      time.Time
		order   int
		account int64
		cells   []string
	}
	var rows []row
	in := func(t time.Time) bool { return !t.Before(from) && !t.After(to) }
	add := func(on time.Time, order int, account int64, typ string, goal *int64, amount int64, note string) {
		g := ""
		if goal != nil {
			g = goalName[*goal]
		}
		rows = append(rows, row{on, order, account, []string{on.Format(time.DateOnly), safeCell(accName[account]), typ, safeCell(g), FormatCents(amount), safeCell(note)}})
	}
	for _, acc := range d.accounts {
		if in(acc.OpeningDate) {
			add(acc.OpeningDate, 0, acc.ID, "opening", nil, acc.OpeningBalance, "")
		}
	}
	for _, m := range moves {
		if !in(m.OccurredOn) {
			continue
		}
		if m.Kind == "transfer" {
			add(m.OccurredOn, 1, m.AccountID, "transfer_out", nil, m.Amount, m.Note)
			add(m.OccurredOn, 1, *m.ToAccountID, "transfer_in", nil, m.Amount, m.Note)
			continue
		}
		add(m.OccurredOn, 1, m.AccountID, m.Kind, m.GoalID, m.Amount, m.Note)
	}
	for id, vals := range d.vals {
		for _, v := range vals {
			if in(v.On) {
				add(v.On, 2, id, "valuation", nil, v.Value, "")
			}
		}
	}
	slices.SortStableFunc(rows, func(x, y row) int {
		if c := x.on.Compare(y.on); c != 0 {
			return c
		}
		if c := cmp.Compare(x.order, y.order); c != 0 {
			return c
		}
		return cmp.Compare(x.account, y.account) // ties: older account first
	})
	cw, err := newCSV(w, "date", "account", "type", "goal", "amount", "note")
	if err != nil {
		return err
	}
	for _, r := range rows {
		if err := cw.Write(r.cells); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}
