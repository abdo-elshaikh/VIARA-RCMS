UPDATE partial_payment_exceptions
SET status = 'Expired',
    review_notes = COALESCE(review_notes, 'Expired automatically: final result delivery now requires full payment with no exception.')
WHERE transaction_type = 'ResultDelivery'
  AND status IN ('Pending', 'Approved');

INSERT INTO permissions (name, module, description) VALUES
('APPROVE_PARTIAL_PAYMENT_EXCEPTION', 'Billing', 'Approve or reject clinical queue movement exceptions for partially paid invoices')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
