-- Backfill balanced journal batches for transactions created before Financial Reporting V2.

INSERT INTO journal_batches (source_type, source_id, business_date, branch_id, currency_code, description, posted_by, posted_at)
SELECT 'Invoice', i.invoice_id, i.business_date, i.branch_id, i.currency_code,
       'Invoice ' || i.invoice_number, i.discount_approved_by, i.generated_at
FROM invoices i
WHERE i.invoice_status <> 'Voided'
ON CONFLICT (source_type, source_id) DO NOTHING;

INSERT INTO journal_entries (batch_id, account_code, account_name, debit, credit, patient_id, doctor_id)
SELECT b.batch_id, entry.account_code, entry.account_name, entry.debit, entry.credit, i.patient_id, entry.doctor_id
FROM invoices i
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
WHERE (entry.debit > 0 OR entry.credit > 0)
  AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.batch_id = b.batch_id AND je.account_code = entry.account_code
  );

INSERT INTO journal_batches (source_type, source_id, business_date, branch_id, currency_code, description, posted_by, posted_at)
SELECT 'Payment', p.payment_id, p.business_date, p.branch_id, p.currency_code,
       'Payment for ' || i.invoice_number, p.processed_by, p.transaction_date
FROM payments p
JOIN invoices i ON i.invoice_id = p.invoice_id
WHERE p.payment_status = 'Completed'
ON CONFLICT (source_type, source_id) DO NOTHING;

INSERT INTO journal_entries (batch_id, account_code, account_name, debit, credit, patient_id)
SELECT b.batch_id,
       CASE WHEN p.method = 'Cash' THEN '1000' ELSE '1010' END,
       CASE WHEN p.method = 'Cash' THEN 'Cash on hand' ELSE COALESCE(p.method, 'Payment') || ' clearing' END,
       p.amount, 0, i.patient_id
FROM payments p
JOIN invoices i ON i.invoice_id = p.invoice_id
JOIN journal_batches b ON b.source_type = 'Payment' AND b.source_id = p.payment_id
WHERE p.payment_status = 'Completed'
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.batch_id = b.batch_id);

INSERT INTO journal_entries (batch_id, account_code, account_name, debit, credit, patient_id)
SELECT b.batch_id, '1100', 'Patient receivables', 0, p.amount, i.patient_id
FROM payments p
JOIN invoices i ON i.invoice_id = p.invoice_id
JOIN journal_batches b ON b.source_type = 'Payment' AND b.source_id = p.payment_id
WHERE p.payment_status = 'Completed'
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.batch_id = b.batch_id AND je.account_code = '1100');

INSERT INTO journal_batches (source_type, source_id, business_date, branch_id, currency_code, description, posted_by, posted_at)
SELECT 'Refund', r.refund_id, r.business_date, r.branch_id, r.currency_code,
       'Refund for ' || i.invoice_number, r.processed_by, r.processed_at
FROM refunds r
JOIN invoices i ON i.invoice_id = r.invoice_id
WHERE r.status = 'Processed'
ON CONFLICT (source_type, source_id) DO NOTHING;

INSERT INTO journal_entries (batch_id, account_code, account_name, debit, credit, patient_id)
SELECT b.batch_id, entry.account_code, entry.account_name, entry.debit, entry.credit, i.patient_id
FROM refunds r
JOIN invoices i ON i.invoice_id = r.invoice_id
JOIN credit_notes c ON c.refund_id = r.refund_id AND c.reversed_at IS NULL
JOIN journal_batches b ON b.source_type = 'Refund' AND b.source_id = r.refund_id
CROSS JOIN LATERAL (
    VALUES
        ('4050', 'Sales returns', c.net_amount, 0::numeric),
        ('2100', 'Tax payable', c.tax_amount, 0::numeric),
        (CASE WHEN r.method = 'Cash' THEN '1000' ELSE '1010' END,
         CASE WHEN r.method = 'Cash' THEN 'Cash on hand' ELSE COALESCE(r.method, 'Refund') || ' clearing' END,
         0::numeric, r.amount)
) AS entry(account_code, account_name, debit, credit)
WHERE (entry.debit > 0 OR entry.credit > 0)
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.batch_id = b.batch_id AND je.account_code = entry.account_code);

INSERT INTO journal_batches (source_type, source_id, business_date, branch_id, currency_code, description, posted_by, posted_at)
SELECT 'ClaimReceipt', cr.claim_receipt_id, cr.business_date, cr.branch_id, cr.currency_code,
       'Insurance receipt', cr.received_by, cr.received_at
FROM claim_receipts cr
ON CONFLICT (source_type, source_id) DO NOTHING;

INSERT INTO journal_entries (batch_id, account_code, account_name, debit, credit, patient_id, payer_id)
SELECT b.batch_id, entry.account_code, entry.account_name, entry.debit, entry.credit, i.patient_id, ic.provider_id
FROM claim_receipts cr
JOIN insurance_claims ic ON ic.claim_id = cr.claim_id
LEFT JOIN invoices i ON i.invoice_id = cr.invoice_id
JOIN journal_batches b ON b.source_type = 'ClaimReceipt' AND b.source_id = cr.claim_receipt_id
CROSS JOIN LATERAL (
    VALUES ('1020', 'Insurance clearing', cr.amount, 0::numeric),
           ('1110', 'Insurance receivables', 0::numeric, cr.amount)
) AS entry(account_code, account_name, debit, credit)
WHERE NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.batch_id = b.batch_id AND je.account_code = entry.account_code);

INSERT INTO journal_batches (source_type, source_id, business_date, branch_id, currency_code, description, posted_by, posted_at)
SELECT 'Expense', e.expense_id, e.expense_date, e.branch_id, e.currency_code,
       COALESCE(e.notes, 'Operating expense'), e.logged_by, e.created_at
FROM expenses e
WHERE e.reversed_at IS NULL
ON CONFLICT (source_type, source_id) DO NOTHING;

INSERT INTO journal_entries (batch_id, account_code, account_name, debit, credit)
SELECT b.batch_id, entry.account_code, entry.account_name, entry.debit, entry.credit
FROM expenses e
JOIN journal_batches b ON b.source_type = 'Expense' AND b.source_id = e.expense_id
CROSS JOIN LATERAL (
    VALUES
        ('6000', 'Operating expenses', GREATEST(0, e.amount - e.tax_amount), 0::numeric),
        ('1200', 'Recoverable input tax', e.tax_amount, 0::numeric),
        (CASE WHEN e.payment_method = 'Cash' THEN '1000' ELSE '1010' END,
         CASE WHEN e.payment_method = 'Cash' THEN 'Cash on hand' ELSE COALESCE(e.payment_method, 'Expense') || ' clearing' END,
         0::numeric, e.amount)
) AS entry(account_code, account_name, debit, credit)
WHERE (entry.debit > 0 OR entry.credit > 0)
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.batch_id = b.batch_id AND je.account_code = entry.account_code);

INSERT INTO journal_batches (source_type, source_id, business_date, branch_id, currency_code, description, posted_by, posted_at)
SELECT 'CommissionPayment', cp.payable_id, cp.business_date, cp.branch_id, cp.currency_code,
       'Referring doctor commission payment', cp.paid_by, COALESCE(cp.paid_date, cp.created_at)
FROM commission_payables cp
WHERE cp.status = 'Paid'
ON CONFLICT (source_type, source_id) DO NOTHING;

INSERT INTO journal_entries (batch_id, account_code, account_name, debit, credit, doctor_id)
SELECT b.batch_id, entry.account_code, entry.account_name, entry.debit, entry.credit, cp.doctor_id
FROM commission_payables cp
JOIN journal_batches b ON b.source_type = 'CommissionPayment' AND b.source_id = cp.payable_id
CROSS JOIN LATERAL (
    VALUES ('2200', 'Commission payable', cp.amount, 0::numeric),
           ('1010', 'Commission payment clearing', 0::numeric, cp.amount)
) AS entry(account_code, account_name, debit, credit)
WHERE cp.status = 'Paid'
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.batch_id = b.batch_id AND je.account_code = entry.account_code);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM journal_batches b
        JOIN journal_entries e ON e.batch_id = b.batch_id
        GROUP BY b.batch_id
        HAVING ROUND(SUM(e.debit), 2) <> ROUND(SUM(e.credit), 2)
    ) THEN
        RAISE EXCEPTION 'Financial journal backfill produced an unbalanced batch';
    END IF;
END $$;

