-- +goose Up
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    currency      TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    locale        TEXT NOT NULL CHECK (locale IN ('es', 'en')),
    timezone      TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    family_id  TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE categories (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    kind       TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    color      TEXT NOT NULL DEFAULT '#64748b',
    icon       TEXT NOT NULL DEFAULT 'tag',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, kind, name)
);

CREATE TABLE payment_methods (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    nickname             TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 60),
    type                 TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'cash', 'transfer')),
    bank                 TEXT,
    network              TEXT CHECK (network IN ('visa', 'mastercard', 'amex', 'other')),
    last4                TEXT CHECK (last4 ~ '^[0-9]{4}$'),
    color                TEXT NOT NULL DEFAULT '#64748b',
    active               BOOLEAN NOT NULL DEFAULT true,
    credit_limit         BIGINT CHECK (credit_limit > 0),
    statement_day        INTEGER CHECK (statement_day BETWEEN 1 AND 31),
    payment_due_day      INTEGER CHECK (payment_due_day BETWEEN 1 AND 31),
    opening_balance      BIGINT NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
    opening_balance_date DATE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((type = 'credit') = (statement_day IS NOT NULL AND payment_due_day IS NOT NULL AND opening_balance_date IS NOT NULL)),
    CHECK (type = 'credit' OR (credit_limit IS NULL AND opening_balance = 0))
);
CREATE INDEX payment_methods_user_idx ON payment_methods (user_id);

CREATE TABLE income_sources (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    category_id  BIGINT REFERENCES categories,
    name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    amount       BIGINT NOT NULL CHECK (amount > 0),
    day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    start_month  DATE NOT NULL CHECK (EXTRACT(DAY FROM start_month) = 1),
    end_month    DATE CHECK (EXTRACT(DAY FROM end_month) = 1),
    active       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_month IS NULL OR end_month >= start_month)
);
CREATE INDEX income_sources_user_idx ON income_sources (user_id);

CREATE TABLE fixed_payments (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    category_id       BIGINT NOT NULL REFERENCES categories,
    payment_method_id BIGINT REFERENCES payment_methods,
    name              TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    amount            BIGINT NOT NULL CHECK (amount > 0),
    day_of_month      INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    start_month       DATE NOT NULL CHECK (EXTRACT(DAY FROM start_month) = 1),
    end_month         DATE CHECK (EXTRACT(DAY FROM end_month) = 1),
    active            BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_month IS NULL OR end_month >= start_month)
);
CREATE INDEX fixed_payments_user_idx ON fixed_payments (user_id);

CREATE TABLE installment_plans (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    payment_method_id BIGINT NOT NULL REFERENCES payment_methods,
    category_id       BIGINT NOT NULL REFERENCES categories,
    description       TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 120),
    total_amount      BIGINT NOT NULL CHECK (total_amount > 0),
    installments      INTEGER NOT NULL CHECK (installments BETWEEN 2 AND 48),
    purchased_on      DATE NOT NULL,
    cancelled_on      DATE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (total_amount >= installments)
);
CREATE INDEX installment_plans_user_idx ON installment_plans (user_id, payment_method_id);

CREATE TABLE monthly_entries (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    month               DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
    kind                TEXT NOT NULL CHECK (kind IN ('income', 'fixed', 'installment')),
    income_source_id    BIGINT REFERENCES income_sources ON DELETE CASCADE,
    fixed_payment_id    BIGINT REFERENCES fixed_payments ON DELETE CASCADE,
    installment_plan_id BIGINT REFERENCES installment_plans ON DELETE CASCADE,
    installment_no      INTEGER,
    name                TEXT NOT NULL,
    category_id         BIGINT REFERENCES categories,
    payment_method_id   BIGINT REFERENCES payment_methods,
    amount              BIGINT NOT NULL CHECK (amount > 0),
    due_date            DATE NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'received', 'skipped')),
    settled_on          DATE,
    edited              BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (kind = 'income' AND income_source_id IS NOT NULL AND fixed_payment_id IS NULL AND installment_plan_id IS NULL AND installment_no IS NULL)
     OR (kind = 'fixed' AND fixed_payment_id IS NOT NULL AND income_source_id IS NULL AND installment_plan_id IS NULL AND installment_no IS NULL)
     OR (kind = 'installment' AND installment_plan_id IS NOT NULL AND installment_no IS NOT NULL AND income_source_id IS NULL AND fixed_payment_id IS NULL)
    ),
    UNIQUE (income_source_id, month),
    UNIQUE (fixed_payment_id, month),
    UNIQUE (installment_plan_id, installment_no)
);
CREATE INDEX monthly_entries_user_month_idx ON monthly_entries (user_id, month);
CREATE INDEX monthly_entries_user_due_idx ON monthly_entries (user_id, due_date);

CREATE TABLE expenses (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    category_id       BIGINT NOT NULL REFERENCES categories,
    payment_method_id BIGINT REFERENCES payment_methods,
    amount            BIGINT NOT NULL CHECK (amount > 0),
    description       TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 200),
    spent_on          DATE NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_user_spent_idx ON expenses (user_id, spent_on DESC, id DESC);

CREATE TABLE card_payments (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    payment_method_id BIGINT NOT NULL REFERENCES payment_methods,
    amount            BIGINT NOT NULL CHECK (amount > 0),
    paid_on           DATE NOT NULL,
    note              TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX card_payments_user_idx ON card_payments (user_id, payment_method_id, paid_on);

CREATE TABLE category_budgets (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    category_id   BIGINT NOT NULL REFERENCES categories ON DELETE CASCADE,
    monthly_limit BIGINT NOT NULL CHECK (monthly_limit > 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, category_id)
);

-- +goose Down
DROP TABLE category_budgets, card_payments, expenses, monthly_entries, installment_plans,
    fixed_payments, income_sources, payment_methods, categories, refresh_tokens, users;
