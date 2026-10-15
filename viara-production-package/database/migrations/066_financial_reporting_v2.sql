-- Financial Reporting V2: additive integrity, recognition, and period controls.

CREATE TABLE IF NOT EXISTS financial_branches (
    branch_id UUID PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    timezone VARCHAR(80) NOT NULL DEFAULT 'Africa/Cairo',
    currency_code CHAR(3) NOT NULL DEFAULT 'EGP',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO financial_branches (branch_id, code, name, timezone, currency_code)
VALUES ('00000000-0000-4000-8000-000000000001', 'MAIN', 'Main branch', 'Africa/Cairo', 'EGP')
ON CONFLICT (branch_id) DO NOTHING;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS fixed_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS percentage_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS business_date DATE,
    ADD COLUMN IF NOT EXISTS service_date DATE,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'EGP',
    ADD COLUMN IF NOT EXISTS idempotency_key UUID,
    ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64);

UPDATE invoices
SET percentage_discount_amount = ROUND(COALESCE(subtotal_amount, 0) * COALESCE(discount_percentage, 0) / 100.0, 2),
    fixed_discount_amount = GREATEST(
        0,
        COALESCE(discount_amount, 0)
        - ROUND(COALESCE(subtotal_amount, 0) * COALESCE(discount_percentage, 0) / 100.0, 2)
    ),
    business_date = COALESCE(business_date, (generated_at AT TIME ZONE 'Africa/Cairo')::date),
    service_date = COALESCE(service_date, (generated_at AT TIME ZONE 'Africa/Cairo')::date),
    branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001');

ALTER TABLE invoices
    ALTER COLUMN business_date SET DEFAULT CURRENT_DATE,
    ALTER COLUMN service_date SET DEFAULT CURRENT_DATE,
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_active_exam_unique
    ON invoices(exam_id)
    WHERE exam_id IS NOT NULL AND invoice_status <> 'Voided';

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_active_appointment_unique
    ON invoices(appointment_id)
    WHERE appointment_id IS NOT NULL AND invoice_status <> 'Voided';

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idempotency
    ON invoices(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_discount_components') THEN
        ALTER TABLE invoices ADD CONSTRAINT chk_invoices_discount_components
            CHECK (fixed_discount_amount >= 0 AND percentage_discount_amount >= 0);
    END IF;
END $$;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS business_date DATE,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'EGP';
UPDATE payments
SET business_date = COALESCE(business_date, (transaction_date AT TIME ZONE 'Africa/Cairo')::date),
    branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001');
ALTER TABLE payments
    ALTER COLUMN business_date SET DEFAULT CURRENT_DATE,
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE refunds
    ADD COLUMN IF NOT EXISTS business_date DATE,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'EGP';
UPDATE refunds
SET business_date = COALESCE(business_date, (COALESCE(processed_at, created_at) AT TIME ZONE 'Africa/Cairo')::date),
    branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001');
ALTER TABLE refunds
    ALTER COLUMN business_date SET DEFAULT CURRENT_DATE,
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'EGP';
UPDATE expenses SET branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001');
ALTER TABLE expenses ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE commission_payables
    ADD COLUMN IF NOT EXISTS business_date DATE,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'EGP';
UPDATE commission_payables
SET business_date = COALESCE(business_date, (COALESCE(paid_date, created_at) AT TIME ZONE 'Africa/Cairo')::date),
    branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001');
ALTER TABLE commission_payables
    ALTER COLUMN business_date SET DEFAULT CURRENT_DATE,
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE cashier_shifts
    ADD COLUMN IF NOT EXISTS business_date DATE,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'EGP';
UPDATE cashier_shifts
SET business_date = COALESCE(business_date, (opened_at AT TIME ZONE 'Africa/Cairo')::date),
    branch_id = COALESCE(branch_id, '00000000-0000-4000-8000-000000000001');
ALTER TABLE cashier_shifts
    ALTER COLUMN business_date SET DEFAULT CURRENT_DATE,
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE cashier_closures
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'EGP';
UPDATE cashier_closures cc
SET branch_id = COALESCE(cc.branch_id, cs.branch_id, '00000000-0000-4000-8000-000000000001'),
    business_date = COALESCE(cc.business_date, cs.business_date)
FROM cashier_shifts cs
WHERE cs.shift_id = cc.shift_id;
ALTER TABLE cashier_closures ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE insurance_claims
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id),
    ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'EGP';
UPDATE insurance_claims c
SET branch_id = COALESCE(c.branch_id, i.branch_id, '00000000-0000-4000-8000-000000000001')
FROM invoices i
WHERE i.invoice_id = c.invoice_id;
UPDATE insurance_claims
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;
ALTER TABLE insurance_claims ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001';

CREATE TABLE IF NOT EXISTS credit_notes (
    credit_note_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_note_number VARCHAR(60) NOT NULL UNIQUE,
    invoice_id UUID NOT NULL REFERENCES invoices(invoice_id) ON DELETE RESTRICT,
    refund_id UUID UNIQUE REFERENCES refunds(refund_id) ON DELETE RESTRICT,
    gross_amount NUMERIC(12,2) NOT NULL CHECK (gross_amount > 0),
    net_amount NUMERIC(12,2) NOT NULL CHECK (net_amount >= 0),
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    patient_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (patient_amount >= 0),
    insurance_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (insurance_amount >= 0),
    reason TEXT NOT NULL,
    business_date DATE NOT NULL,
    branch_id UUID NOT NULL REFERENCES financial_branches(branch_id),
    currency_code CHAR(3) NOT NULL DEFAULT 'EGP',
    issued_by UUID REFERENCES users(user_id),
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reversed_at TIMESTAMP WITH TIME ZONE,
    reversed_by UUID REFERENCES users(user_id),
    reversal_reason TEXT
);

CREATE SEQUENCE IF NOT EXISTS credit_note_number_seq START 1;
ALTER TABLE credit_notes ALTER COLUMN credit_note_number
    SET DEFAULT ('CRN-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('credit_note_number_seq')::text, 6, '0'));

CREATE TABLE IF NOT EXISTS claim_receipts (
    claim_receipt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES insurance_claims(claim_id) ON DELETE RESTRICT,
    invoice_id UUID REFERENCES invoices(invoice_id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    business_date DATE NOT NULL,
    branch_id UUID NOT NULL REFERENCES financial_branches(branch_id),
    currency_code CHAR(3) NOT NULL DEFAULT 'EGP',
    reference_number VARCHAR(150),
    cumulative_amount NUMERIC(12,2) NOT NULL CHECK (cumulative_amount > 0),
    received_by UUID REFERENCES users(user_id),
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    idempotency_key UUID UNIQUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_receipts_cumulative
    ON claim_receipts(claim_id, cumulative_amount);

CREATE TABLE IF NOT EXISTS financial_periods (
    period_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('Daily', 'Monthly', 'Yearly')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    branch_id UUID NOT NULL REFERENCES financial_branches(branch_id),
    currency_code CHAR(3) NOT NULL DEFAULT 'EGP',
    status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closing', 'Finalized', 'Reopened')),
    totals_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    snapshot_checksum VARCHAR(64),
    closed_by UUID REFERENCES users(user_id),
    approved_by UUID REFERENCES users(user_id),
    closed_at TIMESTAMP WITH TIME ZONE,
    reopened_by UUID REFERENCES users(user_id),
    reopened_at TIMESTAMP WITH TIME ZONE,
    reopen_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_date >= start_date),
    UNIQUE (period_type, start_date, end_date, branch_id)
);

CREATE TABLE IF NOT EXISTS journal_batches (
    batch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type VARCHAR(50) NOT NULL,
    source_id UUID NOT NULL,
    business_date DATE NOT NULL,
    branch_id UUID NOT NULL REFERENCES financial_branches(branch_id),
    currency_code CHAR(3) NOT NULL DEFAULT 'EGP',
    description TEXT,
    posted_by UUID REFERENCES users(user_id),
    posted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reversal_of UUID REFERENCES journal_batches(batch_id),
    UNIQUE (source_type, source_id)
);

CREATE TABLE IF NOT EXISTS journal_entries (
    entry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES journal_batches(batch_id) ON DELETE RESTRICT,
    account_code VARCHAR(30) NOT NULL,
    account_name VARCHAR(120) NOT NULL,
    debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    patient_id UUID REFERENCES patients(patient_id),
    doctor_id UUID,
    payer_id UUID,
    modality_id UUID REFERENCES modalities(modality_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE INDEX IF NOT EXISTS idx_invoices_business_branch ON invoices(branch_id, business_date);
CREATE INDEX IF NOT EXISTS idx_payments_business_branch ON payments(branch_id, business_date) WHERE payment_status = 'Completed';
CREATE INDEX IF NOT EXISTS idx_refunds_business_branch ON refunds(branch_id, business_date) WHERE status = 'Processed';
CREATE INDEX IF NOT EXISTS idx_credit_notes_business_branch ON credit_notes(branch_id, business_date) WHERE reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_claim_receipts_business_branch ON claim_receipts(branch_id, business_date);
CREATE INDEX IF NOT EXISTS idx_financial_periods_lookup ON financial_periods(branch_id, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_journal_batches_business ON journal_batches(branch_id, business_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_batch ON journal_entries(batch_id);
