-- name: CreateCategory :one
INSERT INTO categories (user_id, name, kind, color, icon)
VALUES (@user_id, @name, @kind, @color, @icon)
RETURNING *;
