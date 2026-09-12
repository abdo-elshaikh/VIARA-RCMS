-- Complete payroll branch, currency, recurrence, and employee-acknowledgement controls.
-- Existing records are assigned to the default financial branch without data loss.

ALTER TABLE employee_profiles
    ADD COLUMN IF NOT EXISTS payroll_branch_id UUID REFERENCES financial_branches(branch_id);

UPDATE employee_profiles
SET payroll_branch_id = '00000000-0000-4000-8000-000000000001'
WHERE payroll_branch_id IS NULL;

ALTER TABLE employee_profiles
    ALTER COLUMN payroll_branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN payroll_branch_id SET NOT NULL;

ALTER TABLE employee_compensation_profiles
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3);

UPDATE employee_compensation_profiles cp
SET branch_id = COALESCE(cp.branch_id, ep.payroll_branch_id, '00000000-0000-4000-8000-000000000001'),
    currency_code = COALESCE(cp.currency_code, 'EGP')
FROM employee_profiles ep
WHERE ep.user_id = cp.user_id
  AND (cp.branch_id IS NULL OR cp.currency_code IS NULL);

UPDATE employee_compensation_profiles
SET branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001'),
    currency_code = COALESCE(currency_code, 'EGP')
WHERE branch_id IS NULL OR currency_code IS NULL;

ALTER TABLE employee_compensation_profiles
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL,
    ALTER COLUMN currency_code SET DEFAULT 'EGP',
    ALTER COLUMN currency_code SET NOT NULL;

ALTER TABLE payroll_rules
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3);

UPDATE payroll_rules
SET branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001'),
    currency_code = COALESCE(currency_code, 'EGP')
WHERE branch_id IS NULL OR currency_code IS NULL;

ALTER TABLE payroll_rules
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL,
    ALTER COLUMN currency_code SET DEFAULT 'EGP',
    ALTER COLUMN currency_code SET NOT NULL;

DROP INDEX IF EXISTS idx_payroll_rules_metadata_code_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_rules_branch_metadata_code_unique
    ON payroll_rules (branch_id, (metadata->>'code')) WHERE metadata ? 'code';

ALTER TABLE employee_deductions
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3),
    ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS max_occurrences INTEGER,
    ADD COLUMN IF NOT EXISTS applied_occurrences INTEGER NOT NULL DEFAULT 0;

UPDATE employee_deductions d
SET branch_id = COALESCE(d.branch_id, ep.payroll_branch_id, '00000000-0000-4000-8000-000000000001'),
    currency_code = COALESCE(d.currency_code, 'EGP'),
    recurrence_type = COALESCE(
        d.recurrence_type,
        CASE WHEN d.deduction_type IN ('Installment', 'Advance', 'Loan') THEN 'Installment' ELSE 'OneTime' END
    ),
    remaining_amount = CASE
        WHEN d.deduction_type <> 'Percentage' THEN COALESCE(d.remaining_amount, d.total_amount, d.amount)
        ELSE d.remaining_amount
    END
FROM employee_profiles ep
WHERE ep.user_id = d.user_id;

UPDATE employee_deductions
SET branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001'),
    currency_code = COALESCE(currency_code, 'EGP'),
    recurrence_type = COALESCE(recurrence_type, 'OneTime')
WHERE branch_id IS NULL OR currency_code IS NULL OR recurrence_type IS NULL;

ALTER TABLE employee_deductions
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL,
    ALTER COLUMN currency_code SET DEFAULT 'EGP',
    ALTER COLUMN currency_code SET NOT NULL,
    ALTER COLUMN recurrence_type SET DEFAULT 'OneTime',
    ALTER COLUMN recurrence_type SET NOT NULL;

ALTER TABLE employee_deductions DROP CONSTRAINT IF EXISTS employee_deductions_recurrence_check;
ALTER TABLE employee_deductions
    ADD CONSTRAINT employee_deductions_recurrence_check
    CHECK (
        recurrence_type IN ('OneTime', 'Recurring', 'Installment')
        AND applied_occurrences >= 0
        AND (max_occurrences IS NULL OR max_occurrences > 0)
    ) NOT VALID;

ALTER TABLE employee_penalties
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3),
    ADD COLUMN IF NOT EXISTS incident_date DATE,
    ADD COLUMN IF NOT EXISTS acknowledgement_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
    ADD COLUMN IF NOT EXISTS dispute_resolved_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS dispute_resolution TEXT;

UPDATE employee_penalties p
SET branch_id = COALESCE(p.branch_id, ep.payroll_branch_id, '00000000-0000-4000-8000-000000000001'),
    currency_code = COALESCE(p.currency_code, 'EGP'),
    incident_date = COALESCE(p.incident_date, p.created_at::date),
    acknowledgement_status = COALESCE(p.acknowledgement_status, 'Pending')
FROM employee_profiles ep
WHERE ep.user_id = p.user_id;

UPDATE employee_penalties
SET branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001'),
    currency_code = COALESCE(currency_code, 'EGP'),
    incident_date = COALESCE(incident_date, created_at::date),
    acknowledgement_status = COALESCE(acknowledgement_status, 'Pending')
WHERE branch_id IS NULL OR currency_code IS NULL OR incident_date IS NULL OR acknowledgement_status IS NULL;

ALTER TABLE employee_penalties
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL,
    ALTER COLUMN currency_code SET DEFAULT 'EGP',
    ALTER COLUMN currency_code SET NOT NULL,
    ALTER COLUMN incident_date SET DEFAULT CURRENT_DATE,
    ALTER COLUMN incident_date SET NOT NULL,
    ALTER COLUMN acknowledgement_status SET DEFAULT 'Pending',
    ALTER COLUMN acknowledgement_status SET NOT NULL;

ALTER TABLE employee_penalties DROP CONSTRAINT IF EXISTS employee_penalties_acknowledgement_check;
ALTER TABLE employee_penalties
    ADD CONSTRAINT employee_penalties_acknowledgement_check
    CHECK (acknowledgement_status IN ('Pending', 'Acknowledged', 'Disputed', 'Resolved')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_employee_profiles_payroll_branch
    ON employee_profiles(payroll_branch_id, employment_status);
CREATE INDEX IF NOT EXISTS idx_compensation_branch_currency_effective
    ON employee_compensation_profiles(branch_id, currency_code, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_payroll_rules_branch_currency_active
    ON payroll_rules(branch_id, currency_code, status, is_active, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_deductions_branch_currency_status
    ON employee_deductions(branch_id, currency_code, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_penalties_branch_currency_status
    ON employee_penalties(branch_id, currency_code, status, incident_date);
