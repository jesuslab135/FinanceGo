-- +goose Up
-- How often an income source pays. amount is what one payment brings in.
--   monthly:     day_of_month
--   semimonthly: day_of_month and second_day (e.g. 15 and 30)
--   weekly / biweekly: every 7 / 14 days counted from anchor_date, a real pay date
ALTER TABLE income_sources
    ADD COLUMN frequency   TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'semimonthly', 'biweekly', 'weekly')),
    ADD COLUMN second_day  INTEGER CHECK (second_day BETWEEN 1 AND 31),
    ADD COLUMN anchor_date DATE,
    ADD CHECK ((frequency = 'semimonthly') = (second_day IS NOT NULL)),
    ADD CHECK ((frequency IN ('weekly', 'biweekly')) = (anchor_date IS NOT NULL));

-- A source can now land several times in a month; occurrence numbers them by date.
ALTER TABLE monthly_entries ADD COLUMN occurrence INTEGER NOT NULL DEFAULT 1 CHECK (occurrence >= 1);
ALTER TABLE monthly_entries DROP CONSTRAINT monthly_entries_income_source_id_month_key;
ALTER TABLE monthly_entries ADD CONSTRAINT monthly_entries_income_source_id_month_occurrence_key UNIQUE (income_source_id, month, occurrence);

-- +goose Down
DELETE FROM monthly_entries WHERE occurrence > 1;
ALTER TABLE monthly_entries DROP CONSTRAINT monthly_entries_income_source_id_month_occurrence_key;
ALTER TABLE monthly_entries ADD CONSTRAINT monthly_entries_income_source_id_month_key UNIQUE (income_source_id, month);
ALTER TABLE monthly_entries DROP COLUMN occurrence;
ALTER TABLE income_sources DROP COLUMN frequency, DROP COLUMN second_day, DROP COLUMN anchor_date;
