-- name: CreateCardPayment :one
INSERT INTO card_payments (user_id, payment_method_id, amount, paid_on, note)
VALUES (@user_id, @payment_method_id, @amount, @paid_on, @note)
RETURNING *;

-- name: ListCardPayments :many
SELECT * FROM card_payments
WHERE user_id = @user_id
  AND (sqlc.narg(payment_method_id)::bigint IS NULL OR payment_method_id = sqlc.narg(payment_method_id)::bigint)
  AND (sqlc.narg(from_date)::date IS NULL OR paid_on >= sqlc.narg(from_date)::date)
  AND (sqlc.narg(to_date)::date IS NULL OR paid_on <= sqlc.narg(to_date)::date)
ORDER BY paid_on DESC, id DESC;

-- name: CardPaymentsFor :many
SELECT * FROM card_payments WHERE user_id = @user_id AND payment_method_id = @payment_method_id ORDER BY paid_on, id;

-- name: DeleteCardPayment :execrows
DELETE FROM card_payments WHERE id = @id AND user_id = @user_id;

-- name: CardCharges :many
SELECT e.spent_on AS charged_on, e.amount, e.description, 'expense'::text AS source
FROM expenses e
WHERE e.user_id = @user_id AND e.payment_method_id = @payment_method_id
UNION ALL
SELECT COALESCE(m.settled_on, m.due_date) AS charged_on, m.amount, m.name AS description, 'fixed'::text AS source
FROM monthly_entries m
WHERE m.user_id = @user_id AND m.payment_method_id = @payment_method_id AND m.kind = 'fixed' AND m.status = 'paid'
ORDER BY charged_on;

-- name: CreateInstallmentPlan :one
INSERT INTO installment_plans (user_id, payment_method_id, category_id, description, total_amount, installments, purchased_on)
VALUES (@user_id, @payment_method_id, @category_id, @description, @total_amount, @installments, @purchased_on)
RETURNING *;

-- name: ListInstallmentPlans :many
SELECT * FROM installment_plans
WHERE user_id = @user_id
  AND (sqlc.narg(payment_method_id)::bigint IS NULL OR payment_method_id = sqlc.narg(payment_method_id)::bigint)
  AND (NOT sqlc.arg(active_only)::bool OR cancelled_on IS NULL)
ORDER BY purchased_on DESC, id DESC;

-- name: PlansForCard :many
SELECT * FROM installment_plans WHERE user_id = @user_id AND payment_method_id = @payment_method_id ORDER BY purchased_on, id;

-- name: GetInstallmentPlan :one
SELECT * FROM installment_plans WHERE id = @id AND user_id = @user_id;

-- name: UpdateInstallmentPlan :one
UPDATE installment_plans SET payment_method_id = @payment_method_id, category_id = @category_id, description = @description,
    total_amount = @total_amount, installments = @installments, purchased_on = @purchased_on, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: CancelInstallmentPlan :one
UPDATE installment_plans SET cancelled_on = @cancelled_on, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;
