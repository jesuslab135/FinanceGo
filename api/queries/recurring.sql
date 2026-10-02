-- name: CreateIncomeSource :one
INSERT INTO income_sources (user_id, category_id, name, amount, frequency, day_of_month, second_day, anchor_date, start_month, end_month, active)
VALUES (@user_id, sqlc.narg(category_id), @name, @amount, @frequency, @day_of_month, sqlc.narg(second_day), sqlc.narg(anchor_date),
    @start_month, sqlc.narg(end_month), @active)
RETURNING *;

-- name: ListIncomeSources :many
SELECT * FROM income_sources WHERE user_id = @user_id ORDER BY active DESC, name, id;

-- name: UpdateIncomeSource :one
UPDATE income_sources SET category_id = sqlc.narg(category_id), name = @name, amount = @amount,
    frequency = @frequency, day_of_month = @day_of_month, second_day = sqlc.narg(second_day),
    anchor_date = sqlc.narg(anchor_date), start_month = @start_month, end_month = sqlc.narg(end_month),
    active = @active, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: DeactivateIncomeSource :one
-- Ends the template at the current month (NULL when it has not started yet: nothing to keep).
UPDATE income_sources SET active = false,
    end_month = CASE WHEN start_month <= sqlc.arg(current_month)::date THEN LEAST(end_month, sqlc.arg(current_month)::date) END,
    updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: CreateFixedPayment :one
INSERT INTO fixed_payments (user_id, category_id, payment_method_id, name, amount, day_of_month, start_month, end_month, active)
VALUES (@user_id, @category_id, sqlc.narg(payment_method_id), @name, @amount, @day_of_month, @start_month, sqlc.narg(end_month), @active)
RETURNING *;

-- name: ListFixedPayments :many
SELECT * FROM fixed_payments WHERE user_id = @user_id ORDER BY active DESC, name, id;

-- name: UpdateFixedPayment :one
UPDATE fixed_payments SET category_id = @category_id, payment_method_id = sqlc.narg(payment_method_id), name = @name,
    amount = @amount, day_of_month = @day_of_month, start_month = @start_month, end_month = sqlc.narg(end_month),
    active = @active, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: DeactivateFixedPayment :one
-- Ends the template at the current month (NULL when it has not started yet: nothing to keep).
UPDATE fixed_payments SET active = false,
    end_month = CASE WHEN start_month <= sqlc.arg(current_month)::date THEN LEAST(end_month, sqlc.arg(current_month)::date) END,
    updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;
