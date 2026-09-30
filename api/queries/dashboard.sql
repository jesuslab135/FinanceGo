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
