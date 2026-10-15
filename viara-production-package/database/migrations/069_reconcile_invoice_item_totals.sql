-- Repair invoices corrupted by snake_case item mapping during supply synchronization.

CREATE TEMP TABLE invoice_reconciliation_069 ON COMMIT DROP AS
SELECT i.invoice_id
FROM invoices i
LEFT JOIN invoice_items ii ON ii.invoice_id = i.invoice_id
GROUP BY i.invoice_id
HAVING ABS(COALESCE(SUM(ii.total_amount), 0) - i.subtotal_amount) > 0.005;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM invoice_reconciliation_069 r
        JOIN invoices i ON i.invoice_id = r.invoice_id
        WHERE EXISTS (
            SELECT 1 FROM financial_periods fp
            WHERE fp.branch_id = i.branch_id AND fp.status = 'Finalized'
              AND i.business_date BETWEEN fp.start_date AND fp.end_date
        ) OR EXISTS (
            SELECT 1 FROM financial_closures fc
            WHERE fc.status = 'Finalized' AND fc.closure_date = i.business_date
        )
    ) THEN
        RAISE EXCEPTION 'Invoice item reconciliation requires a finalized financial period to be reopened';
    END IF;
END $$;

WITH item_totals AS (
    SELECT r.invoice_id, ROUND(COALESCE(SUM(ii.total_amount), 0), 2) AS subtotal
    FROM invoice_reconciliation_069 r
    LEFT JOIN invoice_items ii ON ii.invoice_id = r.invoice_id
    GROUP BY r.invoice_id
), discounts AS (
    SELECT i.invoice_id, t.subtotal,
           LEAST(t.subtotal, GREATEST(0, i.fixed_discount_amount)) AS fixed_discount,
           ROUND(t.subtotal * LEAST(100, GREATEST(0, i.discount_percentage)) / 100.0, 2) AS percentage_discount,
           i.tax_rate, i.insurance_covered_amount
    FROM invoices i
    JOIN item_totals t ON t.invoice_id = i.invoice_id
), totals AS (
    SELECT d.*,
           LEAST(subtotal, fixed_discount + percentage_discount) AS discount,
           ROUND(GREATEST(0, subtotal - LEAST(subtotal, fixed_discount + percentage_discount)) * tax_rate / 100.0, 2) AS tax
    FROM discounts d
), final_totals AS (
    SELECT t.*,
           ROUND(GREATEST(0, subtotal - discount) + tax, 2) AS total
    FROM totals t
)
UPDATE invoices i
SET subtotal_amount = f.subtotal,
    fixed_discount_amount = f.fixed_discount,
    percentage_discount_amount = f.percentage_discount,
    discount_amount = f.discount,
    tax_amount = f.tax,
    total_amount = f.total,
    insurance_covered_amount = LEAST(f.total, f.insurance_covered_amount),
    patient_payable_amount = GREATEST(0, f.total - LEAST(f.total, f.insurance_covered_amount))
FROM final_totals f
WHERE i.invoice_id = f.invoice_id;

WITH balances AS (
    SELECT i.invoice_id,
           GREATEST(0, i.patient_payable_amount
             - COALESCE((SELECT SUM(c.patient_amount) FROM credit_notes c
                         WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL), 0)) AS payable,
           COALESCE((SELECT SUM(p.amount) FROM payments p
                     WHERE p.invoice_id = i.invoice_id AND p.payment_status = 'Completed'), 0)
             - COALESCE((SELECT SUM(r.amount) FROM refunds r
                         WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0) AS net_paid,
           COALESCE((SELECT SUM(r.amount) FROM refunds r
                     WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0) AS refunded
    FROM invoices i
    JOIN invoice_reconciliation_069 r ON r.invoice_id = i.invoice_id
)
UPDATE invoices i
SET invoice_status = CASE
        WHEN i.invoice_status = 'Voided' THEN 'Voided'
        WHEN b.refunded > 0 AND b.payable <= 0.005 AND b.net_paid <= 0.005 THEN 'Refunded'
        WHEN b.payable <= 0.005 THEN 'Paid'
        WHEN b.net_paid <= 0.005 THEN 'Pending'
        WHEN b.net_paid < b.payable - 0.005 THEN 'Partial'
        ELSE 'Paid'
    END,
    status = CASE
        WHEN i.invoice_status = 'Voided' THEN 'Pending'
        WHEN b.refunded > 0 AND b.payable <= 0.005 AND b.net_paid <= 0.005 THEN 'Refunded'
        WHEN b.payable <= 0.005 THEN 'Paid'
        WHEN b.net_paid <= 0.005 THEN 'Pending'
        WHEN b.net_paid < b.payable - 0.005 THEN 'Partial'
        ELSE 'Paid'
    END::payment_status
FROM balances b
WHERE i.invoice_id = b.invoice_id;

DELETE FROM journal_entries e
USING journal_batches b, invoice_reconciliation_069 r
WHERE e.batch_id = b.batch_id AND b.source_type = 'Invoice' AND b.source_id = r.invoice_id;

DELETE FROM journal_batches b
USING invoice_reconciliation_069 r
WHERE b.source_type = 'Invoice' AND b.source_id = r.invoice_id;

INSERT INTO journal_batches (source_type, source_id, business_date, branch_id, currency_code, description, posted_by, posted_at)
SELECT 'Invoice', i.invoice_id, i.business_date, i.branch_id, i.currency_code,
       'Invoice ' || i.invoice_number, i.discount_approved_by, i.generated_at
FROM invoices i
JOIN invoice_reconciliation_069 r ON r.invoice_id = i.invoice_id
WHERE i.invoice_status <> 'Voided';

INSERT INTO journal_entries (batch_id, account_code, account_name, debit, credit, patient_id, doctor_id)
SELECT b.batch_id, entry.account_code, entry.account_name, entry.debit, entry.credit, i.patient_id, entry.doctor_id
FROM invoices i
JOIN invoice_reconciliation_069 r ON r.invoice_id = i.invoice_id
JOIN journal_batches b ON b.source_type = 'Invoice' AND b.source_id = i.invoice_id
LEFT JOIN examinations ex ON ex.exam_id = i.exam_id
LEFT JOIN appointments a ON a.appointment_id = ex.appointment_id
LEFT JOIN referring_doctors rd ON rd.doctor_id = a.referring_doctor_id
CROSS JOIN LATERAL (
    VALUES
        ('1100', 'Patient receivables', i.patient_payable_amount, 0::numeric, NULL::uuid),
        ('1110', 'Insurance receivables', i.insurance_covered_amount, 0::numeric, NULL::uuid),
        ('4090', 'Sales discounts', i.discount_amount, 0::numeric, NULL::uuid),
        ('4000', 'Imaging service revenue', 0::numeric, i.subtotal_amount, NULL::uuid),
        ('2100', 'Tax payable', 0::numeric, i.tax_amount, NULL::uuid),
        ('5000', 'Referring doctor commission expense',
            CASE WHEN rd.doctor_id IS NULL THEN 0 ELSE ROUND((i.subtotal_amount - i.discount_amount) * COALESCE(rd.commission_percentage, 10) / 100.0, 2) END,
            0::numeric, rd.doctor_id),
        ('2200', 'Commission payable', 0::numeric,
            CASE WHEN rd.doctor_id IS NULL THEN 0 ELSE ROUND((i.subtotal_amount - i.discount_amount) * COALESCE(rd.commission_percentage, 10) / 100.0, 2) END,
            rd.doctor_id)
) AS entry(account_code, account_name, debit, credit, doctor_id)
WHERE entry.debit > 0 OR entry.credit > 0;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM journal_batches b
        JOIN invoice_reconciliation_069 r ON r.invoice_id = b.source_id
        JOIN journal_entries e ON e.batch_id = b.batch_id
        WHERE b.source_type = 'Invoice'
        GROUP BY b.batch_id
        HAVING ROUND(SUM(e.debit), 2) <> ROUND(SUM(e.credit), 2)
    ) THEN
        RAISE EXCEPTION 'Invoice reconciliation produced an unbalanced journal batch';
    END IF;
END $$;
