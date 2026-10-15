-- Enforce posting dimensions after Financial Reporting V2 backfill.

CREATE UNIQUE INDEX IF NOT EXISTS idx_insurance_claims_active_invoice_unique
    ON insurance_claims(invoice_id)
    WHERE invoice_id IS NOT NULL AND status <> 'Written Off';

ALTER TABLE invoices
    ALTER COLUMN business_date SET NOT NULL,
    ALTER COLUMN service_date SET NOT NULL,
    ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE payments
    ALTER COLUMN business_date SET NOT NULL,
    ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE refunds
    ALTER COLUMN business_date SET NOT NULL,
    ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE expenses ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE commission_payables
    ALTER COLUMN business_date SET NOT NULL,
    ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE cashier_shifts
    ALTER COLUMN business_date SET NOT NULL,
    ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE insurance_claims ALTER COLUMN branch_id SET NOT NULL;

