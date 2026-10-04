ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS reversal_reason VARCHAR(500);

ALTER TABLE commission_payables
    ADD COLUMN IF NOT EXISTS idempotency_key UUID,
    ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES users(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_payables_idempotency
    ON commission_payables(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_active_date
    ON expenses(expense_date)
    WHERE reversed_at IS NULL;
