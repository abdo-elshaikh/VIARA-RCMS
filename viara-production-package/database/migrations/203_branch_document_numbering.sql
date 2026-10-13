-- Migration 203: Branch-Scoped Document Numbering & Tax/Commercial Registration Identity (MBT-408 / MBT-708)
-- Ensures invoice and receipt numbering incorporate branch prefix and identity without cross-branch collisions.

CREATE OR REPLACE FUNCTION trg_set_branch_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    v_prefix TEXT;
    v_seq BIGINT;
    v_date TEXT;
BEGIN
    -- Only auto-generate if invoice_number is null or matches the generic default format 'INV-YYYYMMDD-XXXXXX'
    IF NEW.invoice_number IS NULL OR NEW.invoice_number ~ '^INV-[0-9]{8}-[0-9]+$' THEN
        SELECT invoice_prefix INTO v_prefix FROM branches WHERE id = NEW.branch_id;
        IF v_prefix IS NOT NULL AND v_prefix <> '' AND v_prefix <> 'INV-' THEN
            v_seq := nextval('invoice_number_seq');
            v_date := to_char(COALESCE(NEW.business_date, CURRENT_DATE), 'YYYYMMDD');
            NEW.invoice_number := v_prefix || v_date || '-' || lpad(v_seq::text, 6, '0');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoices_branch_prefix ON invoices;
CREATE TRIGGER trg_invoices_branch_prefix
BEFORE INSERT ON invoices
FOR EACH ROW
EXECUTE FUNCTION trg_set_branch_invoice_number();

CREATE OR REPLACE FUNCTION trg_set_branch_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
    v_code TEXT;
    v_seq BIGINT;
    v_date TEXT;
BEGIN
    -- Only auto-generate if receipt_number is null or matches the generic default format 'RCT-YYYYMMDD-XXXXXX'
    IF NEW.receipt_number IS NULL OR NEW.receipt_number ~ '^RCT-[0-9]{8}-[0-9]+$' THEN
        SELECT code INTO v_code FROM branches WHERE id = NEW.branch_id;
        IF v_code IS NOT NULL AND v_code <> '' AND v_code <> 'MAIN' THEN
            v_seq := nextval('receipt_number_seq');
            v_date := to_char(COALESCE(NEW.business_date, CURRENT_DATE), 'YYYYMMDD');
            NEW.receipt_number := 'RCT-' || v_code || '-' || v_date || '-' || lpad(v_seq::text, 6, '0');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_branch_prefix ON payments;
CREATE TRIGGER trg_payments_branch_prefix
BEFORE INSERT ON payments
FOR EACH ROW
EXECUTE FUNCTION trg_set_branch_receipt_number();
