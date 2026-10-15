INSERT INTO permissions (name, module, description) VALUES
('REQUEST_PARTIAL_PAYMENT_EXCEPTION', 'Billing', 'Request approval to continue a restricted transaction for a partially paid invoice'),
('APPROVE_PARTIAL_PAYMENT_EXCEPTION', 'Billing', 'Approve or reject restricted transaction exceptions for partially paid invoices')
ON CONFLICT (name) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT role_name::user_role, permission_id
FROM (VALUES ('Receptionist'), ('Cashier'), ('Accountant')) AS roles(role_name)
CROSS JOIN permissions
WHERE name = 'REQUEST_PARTIAL_PAYMENT_EXCEPTION'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT role_name::user_role, permission_id
FROM (VALUES ('Admin'), ('Accountant')) AS roles(role_name)
CROSS JOIN permissions
WHERE name = 'APPROVE_PARTIAL_PAYMENT_EXCEPTION'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS partial_payment_exceptions (
    exception_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(invoice_id) ON DELETE RESTRICT,
    patient_id UUID REFERENCES patients(patient_id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE SET NULL,
    transaction_type VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    reason TEXT NOT NULL,
    requested_balance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    responsible_party_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    requested_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE partial_payment_exceptions DROP CONSTRAINT IF EXISTS chk_partial_payment_exceptions_transaction;
ALTER TABLE partial_payment_exceptions ADD CONSTRAINT chk_partial_payment_exceptions_transaction
    CHECK (transaction_type IN ('ClinicalQueueTransition', 'ResultDelivery'));

ALTER TABLE partial_payment_exceptions DROP CONSTRAINT IF EXISTS chk_partial_payment_exceptions_status;
ALTER TABLE partial_payment_exceptions ADD CONSTRAINT chk_partial_payment_exceptions_status
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Expired', 'Used'));

CREATE INDEX IF NOT EXISTS idx_partial_payment_exceptions_invoice
    ON partial_payment_exceptions(invoice_id, transaction_type, status);

CREATE INDEX IF NOT EXISTS idx_partial_payment_exceptions_status
    ON partial_payment_exceptions(status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partial_payment_exceptions_one_pending
    ON partial_payment_exceptions(invoice_id, transaction_type)
    WHERE status = 'Pending';
