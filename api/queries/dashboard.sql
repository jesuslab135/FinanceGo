-- name: MonthTotals :one
SELECT
    COALESCE(SUM(amount) FILTER (WHERE kind = 'income' AND status <> 'skipped'), 0)::bigint AS income,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'fixed' AND status <> 'skipped'), 0)::bigint AS fixed_committed,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'fixed' AND status = 'paid'), 0)::bigint AS fixed_paid,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'installment' AND status <> 'skipped'), 0)::bigint AS installments
FROM monthly_entries
WHERE user_id = @user_id AND month = @month;

-- name: SpentBetween :one
SELECT COALESCE(SUM(amount), 0)::bigint AS spent
FROM expenses
WHERE user_id = @user_id AND spent_on BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date;

-- name: BudgetStatus :many
SELECT b.category_id, c.name, c.color, b.monthly_limit,
    (COALESCE((SELECT SUM(e.amount) FROM expenses e
               WHERE e.user_id = b.user_id AND e.category_id = b.category_id
                 AND e.spent_on >= sqlc.arg(month)::date AND e.spent_on < (sqlc.arg(month)::date + INTERVAL '1 month')), 0)
   + COALESCE((SELECT SUM(m.amount) FROM monthly_entries m
               WHERE m.user_id = b.user_id AND m.category_id = b.category_id AND m.month = sqlc.arg(month)::date
                 AND m.kind IN ('fixed', 'installment') AND m.status <> 'skipped'), 0))::bigint AS spent
FROM category_budgets b
JOIN categories c ON c.id = b.category_id
WHERE b.user_id = @user_id
ORDER BY c.name;

-- name: UpsertCategoryBudget :one
INSERT INTO category_budgets (user_id, category_id, monthly_limit)
VALUES (@user_id, @category_id, @monthly_limit)
ON CONFLICT (user_id, category_id) DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit, updated_at = now()
RETURNING *;

-- name: ListCategoryBudgets :many
SELECT * FROM category_budgets WHERE user_id = @user_id ORDER BY category_id;

-- name: DeleteCategoryBudget :execrows
DELETE FROM category_budgets WHERE user_id = @user_id AND category_id = @category_id;

-- name: SpendingSeries :many
WITH buckets AS (
    SELECT gs::date AS start
    FROM generate_series(date_trunc(sqlc.arg(period)::text, sqlc.arg(from_date)::date::timestamp),
                         date_trunc(sqlc.arg(period)::text, sqlc.arg(to_date)::date::timestamp),
                         ('1 ' || sqlc.arg(period)::text)::interval) AS gs
),
ex AS (
    SELECT date_trunc(sqlc.arg(period)::text, e.spent_on::timestamp)::date AS start, SUM(e.amount) AS total
    FROM expenses e
    WHERE e.user_id = @user_id AND e.spent_on BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
    GROUP BY 1
),
fx AS (
    SELECT date_trunc(sqlc.arg(period)::text, m.due_date::timestamp)::date AS start, SUM(m.amount) AS total
    FROM monthly_entries m
    WHERE m.user_id = @user_id AND m.kind IN ('fixed', 'installment') AND m.status <> 'skipped'
      AND m.due_date BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
    GROUP BY 1
)
SELECT b.start::date AS start, COALESCE(ex.total, 0)::bigint AS expenses, COALESCE(fx.total, 0)::bigint AS committed
FROM buckets b
LEFT JOIN ex ON ex.start = b.start
LEFT JOIN fx ON fx.start = b.start
ORDER BY b.start;

-- name: BreakdownByCategory :many
SELECT c.id, c.name, c.color, SUM(x.amount)::bigint AS amount
FROM (
    SELECT e.category_id, e.amount FROM expenses e
    WHERE e.user_id = @user_id AND e.spent_on BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
    UNION ALL
    SELECT m.category_id, m.amount FROM monthly_entries m
    WHERE m.user_id = @user_id AND m.kind IN ('fixed', 'installment') AND m.status <> 'skipped'
      AND m.due_date BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
) x
JOIN categories c ON c.id = x.category_id
GROUP BY c.id, c.name, c.color
ORDER BY amount DESC, c.name;

-- name: BreakdownByPaymentMethod :many
SELECT pm.id, pm.nickname, pm.color, SUM(x.amount)::bigint AS amount
FROM (
    SELECT e.payment_method_id, e.amount FROM expenses e
    WHERE e.user_id = @user_id AND e.spent_on BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
    UNION ALL
    SELECT m.payment_method_id, m.amount FROM monthly_entries m
    WHERE m.user_id = @user_id AND m.kind IN ('fixed', 'installment') AND m.status <> 'skipped'
      AND m.due_date BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
) x
LEFT JOIN payment_methods pm ON pm.id = x.payment_method_id
GROUP BY pm.id, pm.nickname, pm.color
ORDER BY amount DESC;

-- name: UpcomingFixedEntries :many
SELECT * FROM monthly_entries
WHERE user_id = @user_id AND kind = 'fixed' AND status = 'pending'
  AND due_date BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
ORDER BY due_date, id;

-- name: ExportExpenses :many
SELECT e.spent_on, c.name AS category, pm.nickname AS payment_method, e.description, e.amount
FROM expenses e
JOIN categories c ON c.id = e.category_id
LEFT JOIN payment_methods pm ON pm.id = e.payment_method_id
WHERE e.user_id = @user_id AND e.spent_on BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
ORDER BY e.spent_on, e.id;

-- name: ExportEntries :many
SELECT m.month, m.kind, m.name, c.name AS category, pm.nickname AS payment_method, m.due_date, m.status, m.amount
FROM monthly_entries m
LEFT JOIN categories c ON c.id = m.category_id
LEFT JOIN payment_methods pm ON pm.id = m.payment_method_id
WHERE m.user_id = @user_id AND m.due_date BETWEEN sqlc.arg(from_date)::date AND sqlc.arg(to_date)::date
ORDER BY m.due_date, m.id;
