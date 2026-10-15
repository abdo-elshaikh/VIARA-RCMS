-- Expense idempotency key: enables idempotent expense creation through the same pattern
-- as invoices and payments.
ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_idempotency_key
    ON expenses(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
