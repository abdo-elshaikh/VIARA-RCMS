-- Payroll finance posting controls.
-- Keeps payroll payment posting compatible with financial periods and journal batches.

DO $$
BEGIN
    IF to_regclass('financial_branches') IS NOT NULL THEN
        ALTER TABLE payroll_periods
            ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
    ELSE
        ALTER TABLE payroll_periods
            ADD COLUMN IF NOT EXISTS branch_id UUID;
    END IF;
END $$;

UPDATE payroll_periods
SET branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001');

ALTER TABLE payroll_periods
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE payroll_payments
    ADD COLUMN IF NOT EXISTS business_date DATE,
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'EGP';

DO $$
BEGIN
    IF to_regclass('financial_branches') IS NOT NULL THEN
        ALTER TABLE payroll_payments
            ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);
    ELSE
        ALTER TABLE payroll_payments
            ADD COLUMN IF NOT EXISTS branch_id UUID;
    END IF;

    IF to_regclass('journal_batches') IS NOT NULL THEN
        ALTER TABLE payroll_payments
            ADD COLUMN IF NOT EXISTS journal_batch_id UUID REFERENCES journal_batches(batch_id);
    ELSE
        ALTER TABLE payroll_payments
            ADD COLUMN IF NOT EXISTS journal_batch_id UUID;
    END IF;
END $$;

UPDATE payroll_payments pp
SET business_date = COALESCE(pp.business_date, (pp.paid_at AT TIME ZONE 'Africa/Cairo')::date),
    branch_id = COALESCE(pp.branch_id, p.branch_id, '00000000-0000-4000-8000-000000000001'),
    currency_code = COALESCE(pp.currency_code, p.currency_code, 'EGP')
FROM payroll_runs r
JOIN payroll_periods p ON p.period_id = r.period_id
WHERE r.run_id = pp.run_id;

ALTER TABLE payroll_payments
    ALTER COLUMN business_date SET DEFAULT CURRENT_DATE,
    ALTER COLUMN business_date SET NOT NULL,
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_periods_branch_dates ON payroll_periods(branch_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_business_branch ON payroll_payments(branch_id, business_date);

INSERT INTO permissions (name, module, description) VALUES
('VIEW_PAYROLL_JOURNALS', 'Payroll', 'View payroll journal posting references and payment audit context')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT role_name::user_role, p.permission_id
FROM (VALUES
    ('Developer', 'VIEW_PAYROLL_JOURNALS'),
    ('Admin', 'VIEW_PAYROLL_JOURNALS'),
    ('Accountant', 'VIEW_PAYROLL_JOURNALS')
) AS grants(role_name, permission_name)
JOIN permissions p ON p.name = grants.permission_name
ON CONFLICT DO NOTHING;
