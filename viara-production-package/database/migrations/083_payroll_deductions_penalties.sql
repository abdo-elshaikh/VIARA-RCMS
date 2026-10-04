-- Payroll, deductions, and penalties foundation.
-- Additive migration: keep compensation, penalties, and payroll runs auditable and status-driven.

CREATE TABLE IF NOT EXISTS payroll_periods (
    period_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    currency_code CHAR(3) NOT NULL DEFAULT 'EGP',
    total_gross DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_penalties DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_net DECIMAL(14, 2) NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    paid_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    locked_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    locked_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_periods_date_check CHECK (end_date >= start_date),
    CONSTRAINT payroll_periods_status_check CHECK (status IN ('Draft', 'Calculated', 'Reviewed', 'Approved', 'Paid', 'Locked', 'Cancelled'))
);

CREATE TABLE IF NOT EXISTS employee_compensation_profiles (
    profile_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    salary_type VARCHAR(20) NOT NULL DEFAULT 'Monthly',
    base_salary DECIMAL(14, 2) NOT NULL DEFAULT 0,
    hourly_rate DECIMAL(14, 2) NOT NULL DEFAULT 0,
    standard_hours_per_day DECIMAL(6, 2) NOT NULL DEFAULT 8,
    standard_days_per_period DECIMAL(6, 2) NOT NULL DEFAULT 22,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT employee_compensation_salary_type_check CHECK (salary_type IN ('Monthly', 'Hourly')),
    CONSTRAINT employee_compensation_effective_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT employee_compensation_amount_check CHECK (base_salary >= 0 AND hourly_rate >= 0 AND standard_hours_per_day > 0 AND standard_days_per_period > 0)
);

CREATE TABLE IF NOT EXISTS payroll_rules (
    rule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_type VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    calculation_method VARCHAR(40) NOT NULL,
    value DECIMAL(14, 4) NOT NULL DEFAULT 0,
    taxable BOOLEAN NOT NULL DEFAULT TRUE,
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_rules_type_check CHECK (rule_type IN ('Overtime', 'Late', 'EarlyLeave', 'Absence', 'Allowance', 'Deduction', 'Penalty', 'EmployerContribution')),
    CONSTRAINT payroll_rules_method_check CHECK (calculation_method IN ('FixedAmount', 'PercentageOfBase', 'PercentageOfGross', 'HourlyMultiplier', 'PerMinute', 'PerDay')),
    CONSTRAINT payroll_rules_effective_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT payroll_rules_value_check CHECK (value >= 0)
);

CREATE TABLE IF NOT EXISTS employee_deductions (
    deduction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(140) NOT NULL,
    deduction_type VARCHAR(40) NOT NULL DEFAULT 'Fixed',
    amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    percentage DECIMAL(7, 4) NOT NULL DEFAULT 0,
    total_amount DECIMAL(14, 2),
    remaining_amount DECIMAL(14, 2),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    notes TEXT,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT employee_deductions_type_check CHECK (deduction_type IN ('Fixed', 'Percentage', 'Installment', 'Advance', 'Loan', 'Tax', 'SocialInsurance', 'Other')),
    CONSTRAINT employee_deductions_status_check CHECK (status IN ('Draft', 'Approved', 'Paused', 'Completed', 'Cancelled')),
    CONSTRAINT employee_deductions_date_check CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT employee_deductions_amount_check CHECK (amount >= 0 AND percentage >= 0)
);

CREATE TABLE IF NOT EXISTS employee_penalties (
    penalty_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    attendance_id UUID REFERENCES attendance_logs(log_id) ON DELETE SET NULL,
    payroll_period_id UUID REFERENCES payroll_periods(period_id) ON DELETE SET NULL,
    penalty_type VARCHAR(60) NOT NULL DEFAULT 'Policy',
    amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'Manual',
    status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    employee_acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT employee_penalties_status_check CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Applied', 'Cancelled')),
    CONSTRAINT employee_penalties_amount_check CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
    run_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id UUID NOT NULL UNIQUE REFERENCES payroll_periods(period_id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    employee_count INTEGER NOT NULL DEFAULT 0,
    total_gross DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_penalties DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_net DECIMAL(14, 2) NOT NULL DEFAULT 0,
    calculated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    paid_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    locked_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    calculated_at TIMESTAMP WITH TIME ZONE,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    locked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_runs_status_check CHECK (status IN ('Draft', 'Calculated', 'Reviewed', 'Approved', 'Paid', 'Locked', 'Cancelled'))
);

CREATE TABLE IF NOT EXISTS payroll_employee_items (
    item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES payroll_runs(run_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    compensation_profile_id UUID REFERENCES employee_compensation_profiles(profile_id) ON DELETE SET NULL,
    gross_earnings DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(14, 2) NOT NULL DEFAULT 0,
    total_penalties DECIMAL(14, 2) NOT NULL DEFAULT 0,
    net_pay DECIMAL(14, 2) NOT NULL DEFAULT 0,
    attendance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'Calculated',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (run_id, user_id),
    CONSTRAINT payroll_employee_items_status_check CHECK (status IN ('Calculated', 'Reviewed', 'Approved', 'Paid', 'Held'))
);

CREATE TABLE IF NOT EXISTS payroll_line_items (
    line_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES payroll_runs(run_id) ON DELETE CASCADE,
    payroll_employee_item_id UUID NOT NULL REFERENCES payroll_employee_items(item_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    item_type VARCHAR(40) NOT NULL,
    source_type VARCHAR(60),
    source_id UUID,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
    taxable BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_line_items_type_check CHECK (item_type IN ('Earning', 'Deduction', 'Penalty', 'EmployerContribution', 'Adjustment')),
    CONSTRAINT payroll_line_items_amount_check CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS payroll_payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES payroll_runs(run_id) ON DELETE CASCADE,
    payment_method VARCHAR(40) NOT NULL DEFAULT 'BankTransfer',
    reference_number VARCHAR(120),
    paid_amount DECIMAL(14, 2) NOT NULL,
    paid_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    idempotency_key UUID UNIQUE,
    notes TEXT,
    CONSTRAINT payroll_payments_method_check CHECK (payment_method IN ('Cash', 'BankTransfer', 'Check', 'Wallet', 'Other')),
    CONSTRAINT payroll_payments_amount_check CHECK (paid_amount >= 0)
);

CREATE TABLE IF NOT EXISTS payroll_audit_log (
    audit_id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(60) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(80) NOT NULL,
    previous_status VARCHAR(30),
    new_status VARCHAR(30),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    changed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_dates ON payroll_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_status ON payroll_periods(status);
CREATE INDEX IF NOT EXISTS idx_employee_compensation_user_effective ON employee_compensation_profiles(user_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_payroll_rules_type_active ON payroll_rules(rule_type, is_active);
CREATE INDEX IF NOT EXISTS idx_employee_deductions_user_status ON employee_deductions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_deductions_dates ON employee_deductions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_employee_penalties_user_status ON employee_penalties(user_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_penalties_period ON employee_penalties(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employee_items_run ON payroll_employee_items(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_line_items_run_user ON payroll_line_items(run_id, user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_entity ON payroll_audit_log(entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_rules_metadata_code_unique ON payroll_rules ((metadata->>'code')) WHERE metadata ? 'code';

INSERT INTO permissions (name, module, description) VALUES
('VIEW_PAYROLL', 'Payroll', 'View payroll periods, calculations, deductions, and penalties'),
('MANAGE_PAYROLL_PERIODS', 'Payroll', 'Create and maintain payroll periods'),
('CALCULATE_PAYROLL', 'Payroll', 'Calculate and recalculate payroll runs before approval'),
('REVIEW_PAYROLL', 'Payroll', 'Review payroll runs before approval'),
('APPROVE_PAYROLL', 'Payroll', 'Approve payroll runs for payment'),
('PAY_PAYROLL', 'Payroll', 'Record payroll payment execution'),
('LOCK_PAYROLL', 'Payroll', 'Lock paid payroll runs against further changes'),
('MANAGE_PAYROLL_RULES', 'Payroll', 'Configure payroll rules and calculation inputs'),
('MANAGE_EMPLOYEE_COMPENSATION', 'Payroll', 'Manage employee compensation profiles'),
('MANAGE_DEDUCTIONS', 'Payroll', 'Manage employee deductions and advances'),
('MANAGE_PENALTIES', 'Payroll', 'Manage employee payroll penalties'),
('EXPORT_PAYROLL', 'Payroll', 'Export payroll reports and payment files')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Developer'::user_role, permission_id
FROM permissions
WHERE module = 'Payroll'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT role_name::user_role, p.permission_id
FROM (VALUES
    ('Admin', 'VIEW_PAYROLL'),
    ('Admin', 'MANAGE_PAYROLL_PERIODS'),
    ('Admin', 'REVIEW_PAYROLL'),
    ('Admin', 'APPROVE_PAYROLL'),
    ('Admin', 'EXPORT_PAYROLL'),
    ('HR', 'VIEW_PAYROLL'),
    ('HR', 'MANAGE_PAYROLL_PERIODS'),
    ('HR', 'CALCULATE_PAYROLL'),
    ('HR', 'REVIEW_PAYROLL'),
    ('HR', 'MANAGE_PAYROLL_RULES'),
    ('HR', 'MANAGE_EMPLOYEE_COMPENSATION'),
    ('HR', 'MANAGE_DEDUCTIONS'),
    ('HR', 'MANAGE_PENALTIES'),
    ('HR', 'EXPORT_PAYROLL'),
    ('Accountant', 'VIEW_PAYROLL'),
    ('Accountant', 'APPROVE_PAYROLL'),
    ('Accountant', 'PAY_PAYROLL'),
    ('Accountant', 'EXPORT_PAYROLL')
) AS grants(role_name, permission_name)
JOIN permissions p ON p.name = grants.permission_name
ON CONFLICT DO NOTHING;

INSERT INTO payroll_rules (rule_type, name, calculation_method, value, taxable, requires_approval, metadata)
VALUES
('Overtime', 'Standard overtime multiplier', 'HourlyMultiplier', 1.5000, TRUE, TRUE, '{"code":"STANDARD_OVERTIME"}'::jsonb),
('Late', 'Late arrival minute deduction', 'PerMinute', 0.0000, FALSE, TRUE, '{"code":"LATE_MINUTES"}'::jsonb),
('Absence', 'Unpaid absence day deduction', 'PerDay', 1.0000, FALSE, TRUE, '{"code":"UNPAID_ABSENCE"}'::jsonb)
ON CONFLICT DO NOTHING;
