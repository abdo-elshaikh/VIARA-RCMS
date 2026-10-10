-- Promote payroll rule "requires approval" from a display flag to an approval workflow.

ALTER TABLE payroll_rules
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Approved',
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

UPDATE payroll_rules
SET status = 'Approved',
    approved_at = COALESCE(approved_at, created_at)
WHERE status IS NULL;

ALTER TABLE payroll_rules DROP CONSTRAINT IF EXISTS payroll_rules_status_check;
ALTER TABLE payroll_rules
    ADD CONSTRAINT payroll_rules_status_check
    CHECK (status IN ('Pending Approval', 'Approved', 'Rejected', 'Cancelled'));

UPDATE payroll_rules
SET is_active = FALSE
WHERE status IN ('Pending Approval', 'Rejected', 'Cancelled');

CREATE INDEX IF NOT EXISTS idx_payroll_rules_status_created
    ON payroll_rules(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_rules_approved_active
    ON payroll_rules(rule_type, effective_from, effective_to)
    WHERE is_active = TRUE AND status = 'Approved';
