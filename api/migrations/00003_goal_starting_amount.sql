-- +goose Up
ALTER TABLE savings_goals ADD COLUMN starting_amount BIGINT NOT NULL DEFAULT 0 CHECK (starting_amount >= 0);

-- +goose Down
ALTER TABLE savings_goals DROP COLUMN starting_amount;
