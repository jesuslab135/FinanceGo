package service

import (
	"context"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/cards"
	"financego/internal/datex"
	"financego/internal/store"
)

func notCreditCard() error {
	return &apperr.Error{Status: 422, Code: "not_a_credit_card", Message: "statements exist only for credit cards"}
}

// ---- installment rows -------------------------------------------------------

func (s *Service) ensureInstallments(ctx context.Context, q *store.Queries, userID int64, month time.Time) error {
	rows, err := q.ListPlansForEnsure(ctx, userID)
	if err != nil {
		return err
	}
	for _, r := range rows {
		if r.StatementDay == nil || r.PaymentDueDay == nil {
			continue // not a credit card (cannot happen: plans require credit cards)
		}
		sd, dd := int(*r.StatementDay), int(*r.PaymentDueDay)
		p := cards.Plan{ID: r.ID, Total: r.TotalAmount, N: int(r.Installments), PurchasedOn: r.PurchasedOn, CancelledOn: r.CancelledOn}
		k := cards.InstallmentIn(p, sd, month)
		if k == 0 {
			continue
		}
		err := q.InsertInstallmentEntry(ctx, store.InsertInstallmentEntryParams{
			UserID: userID, Month: month, InstallmentPlanID: r.ID, InstallmentNo: int32(k),
			Name:       fmt.Sprintf("%s %d/%d", r.Description, k, p.N),
			CategoryID: r.CategoryID, PaymentMethodID: r.PaymentMethodID,
			Amount: cards.Installments(p.Total, p.N)[k-1], DueDate: cards.DueDate(cards.CycleClose(month, sd), dd),
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// ---- card payments ----------------------------------------------------------

type CardPayment struct {
	ID              int64      `json:"id" validate:"required"`
	PaymentMethodID int64      `json:"payment_method_id" validate:"required"`
	Amount          int64      `json:"amount" validate:"required"`
	PaidOn          datex.Date `json:"paid_on" validate:"required"`
	Note            string     `json:"note" validate:"required"`
}

type CardPaymentInput struct {
	PaymentMethodID int64      `json:"payment_method_id" validate:"required"`
	Amount          int64      `json:"amount" validate:"required"`
	PaidOn          datex.Date `json:"paid_on" validate:"required"`
	Note            string     `json:"note" validate:"required"`
}

func toCardPayment(c store.CardPayment) CardPayment {
	return CardPayment{ID: c.ID, PaymentMethodID: c.PaymentMethodID, Amount: c.Amount, PaidOn: datex.NewDate(c.PaidOn), Note: c.Note}
}

func (s *Service) ListCardPayments(ctx context.Context, a Actor, pmID *int64, from, to *time.Time) ([]CardPayment, error) {
	rows, err := s.q.ListCardPayments(ctx, store.ListCardPaymentsParams{UserID: a.UserID, PaymentMethodID: pmID, FromDate: from, ToDate: to})
	if err != nil {
		return nil, err
	}
	out := make([]CardPayment, len(rows))
	for i, r := range rows {
		out[i] = toCardPayment(r)
	}
	return out, nil
}

func (s *Service) CreateCardPayment(ctx context.Context, a Actor, in CardPaymentInput) (CardPayment, error) {
	in.Note = strings.TrimSpace(in.Note)
	var v apperr.V
	checkAmount(&v, "amount", in.Amount)
	v.Check(!in.PaidOn.IsZero(), "paid_on", "is required")
	v.Check(utf8.RuneCountInString(in.Note) <= 200, "note", "must be at most 200 characters")
	if err := v.Err(); err != nil {
		return CardPayment{}, err
	}
	if _, err := s.checkPaymentMethodRef(ctx, s.q, a.UserID, &in.PaymentMethodID, "payment_method_id", true); err != nil {
		return CardPayment{}, err
	}
	c, err := s.q.CreateCardPayment(ctx, store.CreateCardPaymentParams{UserID: a.UserID, PaymentMethodID: in.PaymentMethodID,
		Amount: in.Amount, PaidOn: in.PaidOn.Time, Note: in.Note})
	if err != nil {
		return CardPayment{}, err
	}
	return toCardPayment(c), nil
}

func (s *Service) DeleteCardPayment(ctx context.Context, a Actor, id int64) error {
	n, err := s.q.DeleteCardPayment(ctx, store.DeleteCardPaymentParams{ID: id, UserID: a.UserID})
	if err != nil {
		return err
	}
	if n == 0 {
		return apperr.NotFound()
	}
	return nil
}

// ---- installment plans ------------------------------------------------------

type InstallmentPlan struct {
	ID                int64       `json:"id" validate:"required"`
	PaymentMethodID   int64       `json:"payment_method_id" validate:"required"`
	CategoryID        int64       `json:"category_id" validate:"required"`
	Description       string      `json:"description" validate:"required"`
	TotalAmount       int64       `json:"total_amount" validate:"required"`
	Installments      int32       `json:"installments" validate:"required"`
	PurchasedOn       datex.Date  `json:"purchased_on" validate:"required"`
	CancelledOn       *datex.Date `json:"cancelled_on"`
	InstallmentAmount int64       `json:"installment_amount" validate:"required"`
	BilledCount       int32       `json:"billed_count" validate:"required"`
	RemainingAmount   int64       `json:"remaining_amount" validate:"required"`
	FirstCycle        datex.Month `json:"first_cycle" validate:"required"`
}

type InstallmentPlanInput struct {
	PaymentMethodID int64      `json:"payment_method_id" validate:"required"`
	CategoryID      int64      `json:"category_id" validate:"required"`
	Description     string     `json:"description" validate:"required"`
	TotalAmount     int64      `json:"total_amount" validate:"required"`
	Installments    int32      `json:"installments" validate:"required"`
	PurchasedOn     datex.Date `json:"purchased_on" validate:"required"`
}

func planOf(p store.InstallmentPlan) cards.Plan {
	return cards.Plan{ID: p.ID, Total: p.TotalAmount, N: int(p.Installments), PurchasedOn: p.PurchasedOn, CancelledOn: p.CancelledOn}
}

func toInstallmentPlan(p store.InstallmentPlan, statementDay int, today time.Time) InstallmentPlan {
	cp := planOf(p)
	billed, billedAmt := cards.Billed(cp, statementDay, today)
	return InstallmentPlan{
		ID: p.ID, PaymentMethodID: p.PaymentMethodID, CategoryID: p.CategoryID, Description: p.Description,
		TotalAmount: p.TotalAmount, Installments: p.Installments, PurchasedOn: datex.NewDate(p.PurchasedOn),
		CancelledOn: datex.DatePtr(p.CancelledOn), InstallmentAmount: cards.Installments(p.TotalAmount, int(p.Installments))[0],
		BilledCount: int32(billed), RemainingAmount: cards.Debt(cp, statementDay) - billedAmt,
		FirstCycle: datex.NewMonth(cards.CycleFor(p.PurchasedOn, statementDay)),
	}
}

func (s *Service) validatePlan(ctx context.Context, q *store.Queries, a Actor, in *InstallmentPlanInput) (*store.PaymentMethod, error) {
	in.Description = strings.TrimSpace(in.Description)
	var v apperr.V
	n := utf8.RuneCountInString(in.Description)
	v.Check(n >= 1 && n <= 120, "description", "must be 1-120 characters")
	checkAmount(&v, "total_amount", in.TotalAmount)
	v.Check(in.Installments >= 2 && in.Installments <= 48, "installments", "must be between 2 and 48")
	v.Check(in.TotalAmount >= int64(in.Installments), "total_amount", "must be at least one cent per installment")
	v.Check(!in.PurchasedOn.IsZero(), "purchased_on", "is required")
	v.Check(in.CategoryID > 0, "category_id", "is required")
	if err := v.Err(); err != nil {
		return nil, err
	}
	if err := s.checkCategoryRef(ctx, q, a.UserID, in.CategoryID, "expense", "category_id"); err != nil {
		return nil, err
	}
	return s.checkPaymentMethodRef(ctx, q, a.UserID, &in.PaymentMethodID, "payment_method_id", true)
}

func (s *Service) statementDayOf(ctx context.Context, q *store.Queries, userID, pmID int64) (int, error) {
	pm, err := q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: pmID, UserID: userID})
	if err != nil {
		return 0, err
	}
	if pm.StatementDay == nil {
		return 0, notCreditCard()
	}
	return int(*pm.StatementDay), nil
}

func (s *Service) ListInstallmentPlans(ctx context.Context, a Actor, pmID *int64, activeOnly bool) ([]InstallmentPlan, error) {
	rows, err := s.q.ListInstallmentPlans(ctx, store.ListInstallmentPlansParams{UserID: a.UserID, PaymentMethodID: pmID, ActiveOnly: activeOnly})
	if err != nil {
		return nil, err
	}
	today := s.today(a)
	out := make([]InstallmentPlan, 0, len(rows))
	days := map[int64]int{}
	for _, r := range rows {
		sd, ok := days[r.PaymentMethodID]
		if !ok {
			if sd, err = s.statementDayOf(ctx, s.q, a.UserID, r.PaymentMethodID); err != nil {
				return nil, err
			}
			days[r.PaymentMethodID] = sd
		}
		out = append(out, toInstallmentPlan(r, sd, today))
	}
	return out, nil
}

func (s *Service) CreateInstallmentPlan(ctx context.Context, a Actor, in InstallmentPlanInput) (InstallmentPlan, error) {
	pm, err := s.validatePlan(ctx, s.q, a, &in)
	if err != nil {
		return InstallmentPlan{}, err
	}
	p, err := s.q.CreateInstallmentPlan(ctx, store.CreateInstallmentPlanParams{UserID: a.UserID, PaymentMethodID: in.PaymentMethodID,
		CategoryID: in.CategoryID, Description: in.Description, TotalAmount: in.TotalAmount, Installments: in.Installments,
		PurchasedOn: in.PurchasedOn.Time})
	if err != nil {
		return InstallmentPlan{}, err
	}
	return toInstallmentPlan(p, int(*pm.StatementDay), s.today(a)), nil
}

// UpdateInstallmentPlan edits a plan. Once an installment has been billed in a
// closed cycle only description and category may change (409 plan_locked otherwise).
func (s *Service) UpdateInstallmentPlan(ctx context.Context, a Actor, id int64, in InstallmentPlanInput) (InstallmentPlan, error) {
	var out InstallmentPlan
	err := s.inTx(ctx, func(q *store.Queries) error {
		cur, err := q.GetInstallmentPlan(ctx, store.GetInstallmentPlanParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		pm, err := s.validatePlan(ctx, q, a, &in)
		if err != nil {
			return err
		}
		curSD, err := s.statementDayOf(ctx, q, a.UserID, cur.PaymentMethodID)
		if err != nil {
			return err
		}
		today := s.today(a)
		billed, _ := cards.Billed(planOf(cur), curSD, today)
		structural := in.PaymentMethodID != cur.PaymentMethodID || in.TotalAmount != cur.TotalAmount ||
			in.Installments != cur.Installments || !in.PurchasedOn.Equal(cur.PurchasedOn)
		if structural && (cur.CancelledOn != nil || billed > 0) {
			return apperr.Conflict("plan_locked", "installments already billed; only description and category can change")
		}
		p, err := q.UpdateInstallmentPlan(ctx, store.UpdateInstallmentPlanParams{ID: id, UserID: a.UserID,
			PaymentMethodID: in.PaymentMethodID, CategoryID: in.CategoryID, Description: in.Description,
			TotalAmount: in.TotalAmount, Installments: in.Installments, PurchasedOn: in.PurchasedOn.Time})
		if err != nil {
			return err
		}
		if structural { // nothing billed yet: drop all rows (any status), they regenerate lazily
			if err := q.DeleteInstallmentEntries(ctx, store.DeleteInstallmentEntriesParams{UserID: a.UserID, PlanID: id, FromNo: 1}); err != nil {
				return err
			}
		}
		if err := q.RelabelInstallmentEntries(ctx, store.RelabelInstallmentEntriesParams{UserID: a.UserID, PlanID: id, Description: p.Description,
			Installments: p.Installments, CategoryID: p.CategoryID}); err != nil {
			return err
		}
		out = toInstallmentPlan(p, int(*pm.StatementDay), today)
		return nil
	})
	return out, err
}

// CancelInstallmentPlan stops a plan today: unbilled installments leave the
// debt and their pending month rows are deleted. Cancelling twice is a no-op.
func (s *Service) CancelInstallmentPlan(ctx context.Context, a Actor, id int64) (InstallmentPlan, error) {
	var out InstallmentPlan
	err := s.inTx(ctx, func(q *store.Queries) error {
		cur, err := q.GetInstallmentPlan(ctx, store.GetInstallmentPlanParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		sd, err := s.statementDayOf(ctx, q, a.UserID, cur.PaymentMethodID)
		if err != nil {
			return err
		}
		today := s.today(a)
		if cur.CancelledOn == nil {
			if cur, err = q.CancelInstallmentPlan(ctx, store.CancelInstallmentPlanParams{ID: id, UserID: a.UserID, CancelledOn: &today}); err != nil {
				return err
			}
			billed, _ := cards.Billed(planOf(cur), sd, today)
			if err := q.DeleteInstallmentEntries(ctx, store.DeleteInstallmentEntriesParams{UserID: a.UserID, PlanID: id, FromNo: int32(billed + 1)}); err != nil {
				return err
			}
		}
		out = toInstallmentPlan(cur, sd, today)
		return nil
	})
	return out, err
}

// ---- statements -------------------------------------------------------------

type StatementCharge struct {
	Date        datex.Date `json:"date" validate:"required"`
	Description string     `json:"description" validate:"required"`
	Amount      int64      `json:"amount" validate:"required"`
	Source      string     `json:"source" validate:"required"`
}

type StatementInstallment struct {
	PlanID      int64  `json:"plan_id" validate:"required"`
	Description string `json:"description" validate:"required"`
	No          int32  `json:"no" validate:"required"`
	Of          int32  `json:"of" validate:"required"`
	Amount      int64  `json:"amount" validate:"required"`
}

type Statement struct {
	PaymentMethodID int64                  `json:"payment_method_id" validate:"required"`
	Cycle           datex.Month            `json:"cycle" validate:"required"`
	OpensOn         datex.Date             `json:"opens_on" validate:"required"`
	ClosesOn        datex.Date             `json:"closes_on" validate:"required"`
	DueOn           datex.Date             `json:"due_on" validate:"required"`
	BilledBalance   int64                  `json:"billed_balance" validate:"required"`
	AmountDue       int64                  `json:"amount_due" validate:"required"`
	CurrentBalance  int64                  `json:"current_balance" validate:"required"`
	CreditLimit     *int64                 `json:"credit_limit"`
	AvailableCredit *int64                 `json:"available_credit"`
	Utilization     *float64               `json:"utilization"`
	Charges         []StatementCharge      `json:"charges" validate:"required"`
	Installments    []StatementInstallment `json:"installments" validate:"required"`
	Payments        []CardPayment          `json:"payments" validate:"required"`
	// PaymentsAfterClose are payments in (closes_on, due_on]; they reduce
	// amount_due below billed_balance.
	PaymentsAfterClose []CardPayment `json:"payments_after_close" validate:"required"`
}

type cardState struct {
	pm       store.PaymentMethod
	card     cards.Card
	charges  []store.CardChargesRow
	payments []store.CardPayment
	plans    []store.InstallmentPlan
}

func (s *Service) loadCard(ctx context.Context, q *store.Queries, userID int64, pm store.PaymentMethod) (cardState, error) {
	if pm.Type != "credit" || pm.StatementDay == nil || pm.PaymentDueDay == nil || pm.OpeningBalanceDate == nil {
		return cardState{}, notCreditCard()
	}
	st := cardState{pm: pm, card: cards.Card{StatementDay: int(*pm.StatementDay), DueDay: int(*pm.PaymentDueDay),
		OpeningBalance: pm.OpeningBalance, OpeningDate: *pm.OpeningBalanceDate}}
	var err error
	if st.charges, err = q.CardCharges(ctx, store.CardChargesParams{UserID: userID, PaymentMethodID: &pm.ID}); err != nil {
		return st, err
	}
	slices.SortStableFunc(st.charges, func(a, b store.CardChargesRow) int { return a.ChargedOn.Compare(b.ChargedOn) })
	if st.payments, err = q.CardPaymentsFor(ctx, store.CardPaymentsForParams{UserID: userID, PaymentMethodID: pm.ID}); err != nil {
		return st, err
	}
	st.plans, err = q.PlansForCard(ctx, store.PlansForCardParams{UserID: userID, PaymentMethodID: pm.ID})
	return st, err
}

func (st cardState) compute(cycle time.Time) cards.Result {
	charges := make([]cards.Movement, len(st.charges))
	for i, c := range st.charges {
		charges[i] = cards.Movement{Date: c.ChargedOn, Amount: c.Amount}
	}
	payments := make([]cards.Movement, len(st.payments))
	for i, p := range st.payments {
		payments[i] = cards.Movement{Date: p.PaidOn, Amount: p.Amount}
	}
	plans := make([]cards.Plan, len(st.plans))
	for i, p := range st.plans {
		plans[i] = planOf(p)
	}
	return cards.Compute(st.card, charges, payments, plans, cycle)
}

// utilization returns current/limit as a percentage with one decimal, and available credit.
func utilization(current int64, limit *int64) (*float64, *int64) {
	if limit == nil || *limit <= 0 {
		return nil, nil
	}
	u := math.Max(0, math.Round(float64(current)*1000/float64(*limit))/10)
	avail := *limit - current
	return &u, &avail
}

func (s *Service) CardStatement(ctx context.Context, a Actor, pmID int64, cycle *time.Time) (Statement, error) {
	pm, err := s.q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: pmID, UserID: a.UserID})
	if err != nil {
		return Statement{}, notFound(err)
	}
	st, err := s.loadCard(ctx, s.q, a.UserID, pm)
	if err != nil {
		return Statement{}, err
	}
	c := cards.RelevantCycle(s.today(a), st.card.StatementDay, st.card.DueDay)
	if cycle != nil {
		c = datex.MonthStart(*cycle)
	}
	r := st.compute(c)
	util, avail := utilization(r.CurrentBalance, pm.CreditLimit)
	out := Statement{
		PaymentMethodID: pmID, Cycle: datex.NewMonth(r.Cycle), OpensOn: datex.NewDate(r.Opens), ClosesOn: datex.NewDate(r.Closes),
		DueOn: datex.NewDate(r.Due), BilledBalance: r.BilledBalance, AmountDue: r.AmountDue, CurrentBalance: r.CurrentBalance,
		CreditLimit: pm.CreditLimit, AvailableCredit: avail, Utilization: util,
		Charges: []StatementCharge{}, Installments: []StatementInstallment{}, Payments: []CardPayment{}, PaymentsAfterClose: []CardPayment{},
	}
	inCycle := func(d time.Time) bool { return !d.Before(r.Opens) && !d.After(r.Closes) }
	for _, ch := range st.charges {
		if inCycle(ch.ChargedOn) && !ch.ChargedOn.Before(st.card.OpeningDate) {
			out.Charges = append(out.Charges, StatementCharge{Date: datex.NewDate(ch.ChargedOn), Description: ch.Description, Amount: ch.Amount, Source: ch.Source})
		}
	}
	for _, p := range st.plans {
		cp := planOf(p)
		if k := cards.InstallmentIn(cp, st.card.StatementDay, r.Cycle); k > 0 {
			out.Installments = append(out.Installments, StatementInstallment{PlanID: p.ID, Description: p.Description,
				No: int32(k), Of: p.Installments, Amount: cards.Installments(cp.Total, cp.N)[k-1]})
		}
	}
	for _, p := range st.payments {
		if inCycle(p.PaidOn) {
			out.Payments = append(out.Payments, toCardPayment(p))
		} else if p.PaidOn.After(r.Closes) && !p.PaidOn.After(r.Due) && !p.PaidOn.Before(st.card.OpeningDate) {
			out.PaymentsAfterClose = append(out.PaymentsAfterClose, toCardPayment(p))
		}
	}
	return out, nil
}
