-- +goose Up
CREATE TABLE savings_accounts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    institution     TEXT NOT NULL CHECK (length(institution) BETWEEN 1 AND 60),
    kind            TEXT NOT NULL CHECK (kind IN ('bank', 'sofipo', 'fund', 'government', 'broker', 'afore', 'ppr', 'crypto', 'other')),
    color           TEXT NOT NULL DEFAULT '#64748b',
    annual_rate_bp  INTEGER CHECK (annual_rate_bp BETWEEN 0 AND 10000),
    opening_balance BIGINT NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
    opening_date    DATE NOT NULL,
    archived_on     DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE TABLE savings_goals (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    account_id       BIGINT NOT NULL REFERENCES savings_accounts ON DELETE CASCADE,
    name             TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    kind             TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard', 'emergency')),
    emergency_months INTEGER CHECK (emergency_months IN (3, 6)),
    target_amount    BIGINT NOT NULL CHECK (target_amount > 0),
    target_date      DATE,
    monthly_amount   BIGINT CHECK (monthly_amount > 0),
    color            TEXT NOT NULL DEFAULT '#64748b',
    icon             TEXT NOT NULL DEFAULT 'piggy-bank',
    start_month      DATE NOT NULL CHECK (EXTRACT(DAY FROM start_month) = 1),
    achieved_on      DATE,
    archived         BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((kind = 'emergency') = (emergency_months IS NOT NULL))
);
CREATE INDEX savings_goals_user_idx ON savings_goals (user_id, account_id);

CREATE TABLE account_movements (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    account_id    BIGINT NOT NULL REFERENCES savings_accounts ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal', 'transfer')),
    to_account_id BIGINT REFERENCES savings_accounts ON DELETE CASCADE,
    goal_id       BIGINT REFERENCES savings_goals ON DELETE SET NULL,
    amount        BIGINT NOT NULL CHECK (amount > 0),
    occurred_on   DATE NOT NULL,
    note          TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((kind = 'transfer') = (to_account_id IS NOT NULL)),
    CHECK (to_account_id <> account_id),
    CHECK (kind <> 'transfer' OR goal_id IS NULL)
);
CREATE INDEX account_movements_user_idx ON account_movements (user_id, occurred_on);
CREATE INDEX account_movements_account_idx ON account_movements (account_id, occurred_on);
CREATE INDEX account_movements_to_idx ON account_movements (to_account_id) WHERE to_account_id IS NOT NULL;

CREATE TABLE account_valuations (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES savings_accounts ON DELETE CASCADE,
    value      BIGINT NOT NULL CHECK (value >= 0),
    valued_on  DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, valued_on)
);
CREATE INDEX account_valuations_user_idx ON account_valuations (user_id);

-- +goose Down
DROP TABLE account_valuations, account_movements, savings_goals, savings_accounts;
