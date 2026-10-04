ALTER TABLE refunds
    ADD COLUMN IF NOT EXISTS cashier_shift_id UUID REFERENCES cashier_shifts(shift_id);

CREATE INDEX IF NOT EXISTS idx_refunds_cashier_shift
    ON refunds(cashier_shift_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cashier_one_open_shift
    ON cashier_shifts(cashier_id)
    WHERE status = 'Open';
