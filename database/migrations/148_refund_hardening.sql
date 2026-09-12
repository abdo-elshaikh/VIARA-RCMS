-- Refund lifecycle hardening.
-- 1. Introduce the 'Failed' state for approved refunds whose execution could
--    not complete (funds no longer refundable, provider rejection...). Failed
--    refunds release their reservation and can be re-approved after the cause
--    is fixed.
-- 2. Classify refund reasons for reporting and anomaly detection.
-- 3. Stamp request-time financial dimensions (branch, currency) so pending
--    requests carry the invoice context instead of placeholder defaults.

ALTER TABLE refunds
    DROP CONSTRAINT IF EXISTS refunds_status_check;

ALTER TABLE refunds
    ADD CONSTRAINT refunds_status_check
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Processed', 'Failed'));

ALTER TABLE refunds
    ADD COLUMN IF NOT EXISTS failure_reason TEXT,
    ADD COLUMN IF NOT EXISTS reason_code VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_refunds_active_reservations
    ON refunds(invoice_id)
    WHERE status IN ('Pending', 'Approved');

-- Pending/approved requests inherit the invoice branch and currency instead
-- of the global placeholder; processed rows keep their execution dimensions.
UPDATE refunds r
SET branch_id = i.branch_id,
    currency_code = i.currency_code
FROM invoices i
WHERE r.invoice_id = i.invoice_id
  AND r.status IN ('Pending', 'Approved')
  AND r.branch_id = '00000000-0000-4000-8000-000000000001'
  AND i.branch_id <> r.branch_id;

-- Notify the requester when their refund is reviewed (approved / rejected /
-- failed), not only when it is finally processed.
INSERT INTO notification_event_catalog (event_type, category, default_priority, default_channels, description, required_variables) VALUES
('RefundReviewed', 'Financial', 'Normal', '{InApp}', 'A refund request was approved, rejected, or failed to execute', '["invoice_number", "amount", "status"]'::jsonb)
ON CONFLICT (event_type) DO NOTHING;

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority,
     inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled) VALUES
('RefundReviewed', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('RefundReviewed', NULL, 'Cashier', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('RefundReviewed', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('RefundReviewed', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('RefundReviewed', NULL, 'Insurance_Staff', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO NOTHING;

INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
('RefundReviewed', 'InApp', 'en', 'Refund Request Reviewed',
 'Your refund request has been reviewed.\n\nInvoice: {{invoice_number}}\nAmount: {{amount}}\nOutcome: {{status}}{{#if review_reason}}\nNotes: {{review_reason}}{{/if}}')
ON CONFLICT (event_type, channel, language) DO NOTHING;
