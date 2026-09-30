-- name: CreateUser :one
INSERT INTO users (email, password_hash, name, currency, locale, timezone)
VALUES (@email, @password_hash, @name, @currency, @locale, @timezone)
RETURNING *;

-- name: GetUser :one
SELECT * FROM users WHERE id = @id;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = @email;

-- name: UpdateUser :one
UPDATE users SET name = @name, currency = @currency, locale = @locale, timezone = @timezone, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: DeleteUser :execrows
DELETE FROM users WHERE id = @id;

-- name: CreateRefreshToken :exec
INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
VALUES (@user_id, @family_id, @token_hash, @expires_at);

-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens WHERE token_hash = @token_hash;

-- name: RevokeRefreshToken :execrows
UPDATE refresh_tokens SET revoked_at = now() WHERE id = @id AND revoked_at IS NULL;

-- name: RevokeRefreshByHash :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = @token_hash AND revoked_at IS NULL;

-- name: RevokeRefreshFamily :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = @family_id AND revoked_at IS NULL;
