-- Phase 6: Billing, Invoicing & Cashier

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50) UNIQUE,
    ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(appointment_id),
    ADD COLUMN IF NOT EXISTS invoice_status VARCHAR(30) DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_reason TEXT,
    ADD COLUMN IF NOT EXISTS discount_approved_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS package_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS package_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS due_date DATE,
    ADD COLUMN IF NOT EXISTS void_reason TEXT,
    ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE invoices
SET invoice_number = 'INV-' || to_char(COALESCE(generated_at, NOW()), 'YYYYMMDD') || '-' || upper(substr(replace(invoice_id::text, '-', ''), 1, 6))
WHERE invoice_number IS NULL;

UPDATE invoices
SET subtotal_amount = COALESCE(NULLIF(subtotal_amount, 0), total_amount),
    invoice_status = COALESCE(invoice_status, status::text);

ALTER TABLE invoices
    ALTER COLUMN invoice_number SET NOT NULL,
    ALTER COLUMN invoice_number SET DEFAULT ('INV-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
    DROP CONSTRAINT IF EXISTS chk_invoices_invoice_status,
    ADD CONSTRAINT chk_invoices_invoice_status CHECK (invoice_status IN ('Draft', 'Pending', 'Partial', 'Paid', 'Refunded', 'Voided'));

CREATE TABLE IF NOT EXISTS invoice_items (
    item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
    exam_id UUID REFERENCES examinations(exam_id),
    exam_type_id UUID REFERENCES examination_types(type_id),
    description VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,2) DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cashier_shifts (
    shift_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cashier_id UUID NOT NULL REFERENCES users(user_id),
    opening_balance DECIMAL(10,2) DEFAULT 0,
    closing_balance DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS cashier_closures (
    closure_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id UUID NOT NULL REFERENCES cashier_shifts(shift_id) ON DELETE CASCADE,
    business_date DATE DEFAULT CURRENT_DATE,
    totals JSONB DEFAULT '{}'::jsonb,
    expected_cash DECIMAL(10,2) DEFAULT 0,
    counted_cash DECIMAL(10,2) DEFAULT 0,
    variance DECIMAL(10,2) DEFAULT 0,
    closed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(50) UNIQUE,
    ADD COLUMN IF NOT EXISTS cashier_shift_id UUID REFERENCES cashier_shifts(shift_id),
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(150),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'Completed',
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

UPDATE payments
SET receipt_number = 'RCT-' || to_char(COALESCE(transaction_date, NOW()), 'YYYYMMDD') || '-' || upper(substr(replace(payment_id::text, '-', ''), 1, 6))
WHERE receipt_number IS NULL;

ALTER TABLE payments
    ALTER COLUMN receipt_number SET DEFAULT ('RCT-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('receipt_number_seq')::text, 6, '0')),
    DROP CONSTRAINT IF EXISTS chk_payments_method,
    ADD CONSTRAINT chk_payments_method CHECK (method IN ('Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer', 'Installment', 'Insurance', 'Corporate')),
    DROP CONSTRAINT IF EXISTS chk_payments_payment_status,
    ADD CONSTRAINT chk_payments_payment_status CHECK (payment_status IN ('Completed', 'Reversed'));

CREATE TABLE IF NOT EXISTS refunds (
    refund_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(payment_id),
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(50) DEFAULT 'Cash' CHECK (method IN ('Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer', 'Installment', 'Insurance', 'Corporate')),
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Processed')),
    requested_by UUID REFERENCES users(user_id),
    approved_by UUID REFERENCES users(user_id),
    processed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_status ON invoices(invoice_status);
CREATE INDEX IF NOT EXISTS idx_invoices_appointment ON invoices(appointment_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_shift ON payments(cashier_shift_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier_status ON cashier_shifts(cashier_id, status);
CREATE INDEX IF NOT EXISTS idx_refunds_invoice ON refunds(invoice_id);
