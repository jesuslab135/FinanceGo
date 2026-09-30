-- name: EnsureIncomeEntries :exec
INSERT INTO monthly_entries (user_id, month, kind, income_source_id, name, category_id, amount, due_date)
SELECT s.user_id, sqlc.arg(month)::date, 'income', s.id, s.name, s.category_id, s.amount,
       sqlc.arg(month)::date + (LEAST(s.day_of_month, EXTRACT(DAY FROM (sqlc.arg(month)::date + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1)
FROM income_sources s
WHERE s.user_id = @user_id AND s.active
  AND s.start_month <= sqlc.arg(month)::date AND (s.end_month IS NULL OR s.end_month >= sqlc.arg(month)::date)
ON CONFLICT DO NOTHING;

-- name: EnsureFixedEntries :exec
INSERT INTO monthly_entries (user_id, month, kind, fixed_payment_id, name, category_id, payment_method_id, amount, due_date)
SELECT f.user_id, sqlc.arg(month)::date, 'fixed', f.id, f.name, f.category_id, f.payment_method_id, f.amount,
       sqlc.arg(month)::date + (LEAST(f.day_of_month, EXTRACT(DAY FROM (sqlc.arg(month)::date + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1)
FROM fixed_payments f
WHERE f.user_id = @user_id AND f.active
  AND f.start_month <= sqlc.arg(month)::date AND (f.end_month IS NULL OR f.end_month >= sqlc.arg(month)::date)
ON CONFLICT DO NOTHING;

-- name: ListMonthEntries :many
SELECT * FROM monthly_entries
WHERE user_id = @user_id AND month = @month
ORDER BY CASE kind WHEN 'income' THEN 0 WHEN 'fixed' THEN 1 ELSE 2 END, due_date, id;

-- name: GetEntry :one
SELECT * FROM monthly_entries WHERE id = @id AND user_id = @user_id;

-- name: UpdateEntry :one
UPDATE monthly_entries SET amount = @amount, status = @status, settled_on = sqlc.narg(settled_on),
    payment_method_id = sqlc.narg(payment_method_id), edited = @edited, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: PropagateIncomeSource :exec
UPDATE monthly_entries m SET name = s.name, amount = s.amount, category_id = s.category_id,
    due_date = m.month + (LEAST(s.day_of_month, EXTRACT(DAY FROM (m.month + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1),
    updated_at = now()
FROM income_sources s
WHERE s.id = @source_id AND m.income_source_id = s.id
  AND m.month >= sqlc.arg(from_month)::date AND m.status = 'pending' AND NOT m.edited;

-- name: PruneIncomeEntries :exec
DELETE FROM monthly_entries m
USING income_sources s
WHERE s.id = @source_id AND m.income_source_id = s.id
  AND m.status = 'pending' AND NOT m.edited AND m.month >= sqlc.arg(from_month)::date
  AND ((NOT s.active AND m.month > sqlc.arg(from_month)::date)
       OR (s.end_month IS NOT NULL AND m.month > s.end_month)
       OR m.month < s.start_month);

-- name: PropagateFixedPayment :exec
UPDATE monthly_entries m SET name = f.name, amount = f.amount, category_id = f.category_id,
    payment_method_id = f.payment_method_id,
    due_date = m.month + (LEAST(f.day_of_month, EXTRACT(DAY FROM (m.month + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1),
    updated_at = now()
FROM fixed_payments f
WHERE f.id = @source_id AND m.fixed_payment_id = f.id
  AND m.month >= sqlc.arg(from_month)::date AND m.status = 'pending' AND NOT m.edited;

-- name: PruneFixedEntries :exec
DELETE FROM monthly_entries m
USING fixed_payments f
WHERE f.id = @source_id AND m.fixed_payment_id = f.id
  AND m.status = 'pending' AND NOT m.edited AND m.month >= sqlc.arg(from_month)::date
  AND ((NOT f.active AND m.month > sqlc.arg(from_month)::date)
       OR (f.end_month IS NOT NULL AND m.month > f.end_month)
       OR m.month < f.start_month);
