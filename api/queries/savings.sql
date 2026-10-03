-- name: CreateSavingsAccount :one
INSERT INTO savings_accounts (user_id, name, institution, kind, color, annual_rate_bp, opening_balance, opening_date)
VALUES (@user_id, @name, @institution, @kind, @color, sqlc.narg(annual_rate_bp), @opening_balance, @opening_date)
RETURNING *;

-- name: UpdateSavingsAccount :one
UPDATE savings_accounts SET name = @name, institution = @institution, kind = @kind, color = @color,
    annual_rate_bp = sqlc.narg(annual_rate_bp), opening_balance = @opening_balance, opening_date = @opening_date,
    archived_on = sqlc.narg(archived_on), updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: GetSavingsAccount :one
SELECT * FROM savings_accounts WHERE id = @id AND user_id = @user_id;

-- name: ListSavingsAccounts :many
SELECT * FROM savings_accounts WHERE user_id = @user_id ORDER BY archived_on NULLS FIRST, name;

-- name: DeleteSavingsAccount :execrows
DELETE FROM savings_accounts WHERE id = @id AND user_id = @user_id;

-- name: CreateSavingsGoal :one
INSERT INTO savings_goals (user_id, account_id, name, kind, emergency_months, target_amount, starting_amount, target_date,
    monthly_amount, color, icon, start_month)
VALUES (@user_id, @account_id, @name, @kind, sqlc.narg(emergency_months), @target_amount, @starting_amount, sqlc.narg(target_date),
    sqlc.narg(monthly_amount), @color, @icon, @start_month)
RETURNING *;

-- name: UpdateSavingsGoal :one
UPDATE savings_goals SET name = @name, kind = @kind, emergency_months = sqlc.narg(emergency_months),
    target_amount = @target_amount, starting_amount = @starting_amount, target_date = sqlc.narg(target_date), monthly_amount = sqlc.narg(monthly_amount),
    color = @color, icon = @icon, archived = @archived, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: SetSavingsGoalAchieved :exec
UPDATE savings_goals SET achieved_on = sqlc.narg(achieved_on), updated_at = now() WHERE id = @id AND user_id = @user_id;

-- name: ArchiveGoalsOfAccount :exec
UPDATE savings_goals SET archived = true, updated_at = now()
WHERE user_id = @user_id AND account_id = @account_id AND NOT archived;

-- name: GetSavingsGoal :one
SELECT * FROM savings_goals WHERE id = @id AND user_id = @user_id;

-- name: ListSavingsGoals :many
SELECT * FROM savings_goals WHERE user_id = @user_id ORDER BY archived, target_date NULLS LAST, id;

-- name: DeleteSavingsGoal :execrows
DELETE FROM savings_goals WHERE id = @id AND user_id = @user_id;

-- name: CreateAccountMovement :one
INSERT INTO account_movements (user_id, account_id, kind, to_account_id, goal_id, amount, occurred_on, note)
VALUES (@user_id, @account_id, @kind, sqlc.narg(to_account_id), sqlc.narg(goal_id), @amount, @occurred_on, @note)
RETURNING *;

-- name: UpdateAccountMovement :one
UPDATE account_movements SET account_id = @account_id, kind = @kind, to_account_id = sqlc.narg(to_account_id),
    goal_id = sqlc.narg(goal_id), amount = @amount, occurred_on = @occurred_on, note = @note, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: GetAccountMovement :one
SELECT * FROM account_movements WHERE id = @id AND user_id = @user_id;

-- name: DeleteAccountMovement :execrows
DELETE FROM account_movements WHERE id = @id AND user_id = @user_id;

-- name: ListAccountMovementsForUser :many
SELECT * FROM account_movements WHERE user_id = @user_id ORDER BY occurred_on, id;

-- name: ListAccountMovementsForAccount :many
SELECT * FROM account_movements
WHERE user_id = @user_id AND (account_id = @account_id OR to_account_id = @account_id)
  AND (sqlc.narg(from_date)::date IS NULL OR occurred_on >= sqlc.narg(from_date)::date)
  AND (sqlc.narg(to_date)::date IS NULL OR occurred_on <= sqlc.narg(to_date)::date)
ORDER BY occurred_on DESC, id DESC;

-- name: UpsertAccountValuation :one
INSERT INTO account_valuations (user_id, account_id, value, valued_on)
VALUES (@user_id, @account_id, @value, @valued_on)
ON CONFLICT (account_id, valued_on) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
RETURNING *;

-- name: DeleteAccountValuation :execrows
DELETE FROM account_valuations WHERE user_id = @user_id AND account_id = @account_id AND valued_on = @valued_on;

-- name: ListAccountValuationsForUser :many
SELECT * FROM account_valuations WHERE user_id = @user_id ORDER BY account_id, valued_on;

-- name: ListAccountValuationsForAccount :many
SELECT * FROM account_valuations WHERE user_id = @user_id AND account_id = @account_id ORDER BY valued_on DESC;
