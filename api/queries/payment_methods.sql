-- name: CreatePaymentMethod :one
INSERT INTO payment_methods (user_id, nickname, type, bank, network, last4, color, active,
    credit_limit, statement_day, payment_due_day, opening_balance, opening_balance_date)
VALUES (@user_id, @nickname, @type, sqlc.narg(bank), sqlc.narg(network), sqlc.narg(last4), @color, @active,
    sqlc.narg(credit_limit), sqlc.narg(statement_day), sqlc.narg(payment_due_day), @opening_balance, sqlc.narg(opening_balance_date))
RETURNING *;

-- name: ListPaymentMethods :many
SELECT * FROM payment_methods WHERE user_id = @user_id ORDER BY active DESC, nickname, id;

-- name: ListCreditCards :many
-- Includes inactive cards: callers keep those that still carry a balance.
SELECT * FROM payment_methods WHERE user_id = @user_id AND type = 'credit' ORDER BY nickname, id;

-- name: GetPaymentMethod :one
SELECT * FROM payment_methods WHERE id = @id AND user_id = @user_id;

-- name: UpdatePaymentMethod :one
UPDATE payment_methods SET nickname = @nickname, bank = sqlc.narg(bank), network = sqlc.narg(network),
    last4 = sqlc.narg(last4), color = @color, active = @active, credit_limit = sqlc.narg(credit_limit),
    statement_day = sqlc.narg(statement_day), payment_due_day = sqlc.narg(payment_due_day),
    opening_balance = @opening_balance, opening_balance_date = sqlc.narg(opening_balance_date), updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: PaymentMethodUsage :one
SELECT ((SELECT count(*) FROM expenses e WHERE e.payment_method_id = @id)
      + (SELECT count(*) FROM fixed_payments f WHERE f.payment_method_id = @id)
      + (SELECT count(*) FROM monthly_entries m WHERE m.payment_method_id = @id)
      + (SELECT count(*) FROM installment_plans p WHERE p.payment_method_id = @id)
      + (SELECT count(*) FROM card_payments c WHERE c.payment_method_id = @id))::bigint AS uses;

-- name: DeletePaymentMethod :execrows
DELETE FROM payment_methods WHERE id = @id AND user_id = @user_id;
