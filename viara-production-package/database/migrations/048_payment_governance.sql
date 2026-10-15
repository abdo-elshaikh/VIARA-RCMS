INSERT INTO permissions (name, module, description) VALUES
('OPEN_CASHIER_SHIFT', 'Billing', 'Open an assigned personal cashier shift'),
('CLOSE_CASHIER_SHIFT', 'Billing', 'Blind-count and close an assigned personal cashier shift'),
('RECONCILE_SHIFTS', 'Billing', 'Review cashier reconciliation and method totals'),
('APPROVE_SHIFT_VARIANCE', 'Billing', 'Review and sign off material cashier variances'),
('VOID_INVOICES', 'Billing', 'Void an invoice with a recorded reason')
ON CONFLICT (name) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description;

-- Remove incompatible legacy grants before applying the separated duty model.
DELETE FROM role_permissions rp USING permissions p
WHERE rp.permission_id = p.permission_id
  AND ((rp.role_name = 'Receptionist' AND p.name IN ('PROCESS_PAYMENTS', 'PROCESS_REFUNDS', 'APPLY_DISCOUNTS', 'ISSUE_REFUNDS'))
    OR (rp.role_name = 'Accountant' AND p.name IN ('PROCESS_PAYMENTS', 'PROCESS_REFUNDS', 'ISSUE_REFUNDS')));

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Receptionist'::user_role, permission_id FROM permissions
WHERE name IN ('VIEW_INVOICES', 'CREATE_INVOICES', 'REQUEST_REFUNDS')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Cashier'::user_role, permission_id FROM permissions
WHERE name IN ('VIEW_INVOICES', 'PROCESS_PAYMENTS', 'OPEN_CASHIER_SHIFT', 'CLOSE_CASHIER_SHIFT', 'REQUEST_REFUNDS', 'PROCESS_REFUNDS')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Accountant'::user_role, permission_id FROM permissions
WHERE name IN ('VIEW_INVOICES', 'CREATE_INVOICES', 'EDIT_INVOICES', 'APPLY_DISCOUNTS', 'REQUEST_REFUNDS', 'APPROVE_REFUNDS', 'RECONCILE_SHIFTS', 'APPROVE_SHIFT_VARIANCE', 'VOID_INVOICES')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id FROM permissions
WHERE name IN ('OPEN_CASHIER_SHIFT', 'CLOSE_CASHIER_SHIFT', 'RECONCILE_SHIFTS', 'APPROVE_SHIFT_VARIANCE', 'VOID_INVOICES')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS financial_operation_keys (
    operation_key_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key UUID NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(user_id),
    operation_type VARCHAR(40) NOT NULL,
    resource_id UUID NOT NULL,
    request_fingerprint VARCHAR(64) NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (actor_id, operation_type, idempotency_key)
);

ALTER TABLE financial_operation_keys
    ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64);
UPDATE financial_operation_keys
SET request_fingerprint = repeat('0', 64)
WHERE request_fingerprint IS NULL;
ALTER TABLE financial_operation_keys
    ALTER COLUMN request_fingerprint SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_operation_keys_created
    ON financial_operation_keys(created_at DESC);

ALTER TABLE cashier_closures
    ADD COLUMN IF NOT EXISTS variance_reason TEXT,
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(30) NOT NULL DEFAULT 'Accepted',
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE cashier_closures DROP CONSTRAINT IF EXISTS chk_cashier_closure_review_status;
ALTER TABLE cashier_closures ADD CONSTRAINT chk_cashier_closure_review_status
    CHECK (review_status IN ('Accepted', 'Requires Review', 'Reviewed'));

CREATE INDEX IF NOT EXISTS idx_cashier_closures_review
    ON cashier_closures(review_status, business_date DESC);
