-- name: CreateExpense :one
INSERT INTO expenses (user_id, category_id, payment_method_id, amount, description, spent_on)
VALUES (@user_id, @category_id, sqlc.narg(payment_method_id), @amount, @description, @spent_on)
RETURNING *;

-- name: UpdateExpense :one
UPDATE expenses SET category_id = @category_id, payment_method_id = sqlc.narg(payment_method_id), amount = @amount,
    description = @description, spent_on = @spent_on, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: DeleteExpense :execrows
DELETE FROM expenses WHERE id = @id AND user_id = @user_id;

-- name: ListExpenses :many
SELECT * FROM expenses
WHERE user_id = @user_id
  AND (sqlc.narg(from_date)::date IS NULL OR spent_on >= sqlc.narg(from_date)::date)
  AND (sqlc.narg(to_date)::date IS NULL OR spent_on <= sqlc.narg(to_date)::date)
  AND (sqlc.narg(category_id)::bigint IS NULL OR category_id = sqlc.narg(category_id)::bigint)
  AND (sqlc.narg(payment_method_id)::bigint IS NULL OR payment_method_id = sqlc.narg(payment_method_id)::bigint)
  AND (sqlc.narg(q)::text IS NULL OR description ILIKE '%' || sqlc.narg(q)::text || '%')
  AND (sqlc.narg(cursor_date)::date IS NULL OR (spent_on, id) < (sqlc.narg(cursor_date)::date, sqlc.narg(cursor_id)::bigint))
ORDER BY spent_on DESC, id DESC
LIMIT @lim;
