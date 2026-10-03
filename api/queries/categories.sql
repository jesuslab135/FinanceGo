-- name: CreateCategory :one
INSERT INTO categories (user_id, name, kind, color, icon)
VALUES (@user_id, @name, @kind, @color, @icon)
RETURNING *;

-- name: ListCategories :many
SELECT * FROM categories
WHERE user_id = @user_id AND (sqlc.narg(kind)::text IS NULL OR kind = sqlc.narg(kind))
ORDER BY kind, name;

-- name: GetCategory :one
SELECT * FROM categories WHERE id = @id AND user_id = @user_id;

-- name: UpdateCategory :one
UPDATE categories SET name = @name, color = @color, icon = @icon, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: CategoryUsage :one
SELECT ((SELECT count(*) FROM expenses e WHERE e.category_id = @id AND e.user_id = @user_id)
      + (SELECT count(*) FROM fixed_payments f WHERE f.category_id = @id AND f.user_id = @user_id)
      + (SELECT count(*) FROM income_sources i WHERE i.category_id = @id AND i.user_id = @user_id)
      + (SELECT count(*) FROM monthly_entries m WHERE m.category_id = @id AND m.user_id = @user_id)
      + (SELECT count(*) FROM installment_plans p WHERE p.category_id = @id AND p.user_id = @user_id))::bigint AS uses;

-- name: ReassignExpensesCategory :exec
UPDATE expenses SET category_id = @to_id, updated_at = now() WHERE category_id = @from_id AND user_id = @user_id;

-- name: ReassignFixedCategory :exec
UPDATE fixed_payments SET category_id = @to_id, updated_at = now() WHERE category_id = @from_id AND user_id = @user_id;

-- name: ReassignIncomeCategory :exec
UPDATE income_sources SET category_id = @to_id, updated_at = now() WHERE category_id = @from_id AND user_id = @user_id;

-- name: ReassignEntriesCategory :exec
UPDATE monthly_entries SET category_id = @to_id, updated_at = now() WHERE category_id = @from_id AND user_id = @user_id;

-- name: ReassignPlansCategory :exec
UPDATE installment_plans SET category_id = @to_id, updated_at = now() WHERE category_id = @from_id AND user_id = @user_id;

-- name: DeleteCategory :execrows
DELETE FROM categories WHERE id = @id AND user_id = @user_id;
