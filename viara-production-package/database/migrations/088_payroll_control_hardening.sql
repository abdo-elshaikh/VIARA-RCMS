-- Payroll control hardening.
-- Adds database-level guardrails for payment uniqueness, non-cash references,
-- and installment balance integrity.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_deductions_balance_check') THEN
        ALTER TABLE employee_deductions
            ADD CONSTRAINT employee_deductions_balance_check
            CHECK (
                (total_amount IS NULL OR total_amount >= 0)
                AND (remaining_amount IS NULL OR remaining_amount >= 0)
                AND percentage <= 100
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_payments_reference_check') THEN
        ALTER TABLE payroll_payments
            ADD CONSTRAINT payroll_payments_reference_check
            CHECK (
                payment_method = 'Cash'
                OR NULLIF(BTRIM(reference_number), '') IS NOT NULL
            ) NOT VALID;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_payments_run_unique
    ON payroll_payments(run_id);
