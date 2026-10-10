-- 024_reporting_indices.sql
-- Add B-Tree indices to temporal columns heavily used in financial and queue reporting

CREATE INDEX IF NOT EXISTS idx_invoices_generated_at ON invoices(generated_at);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_commission_payables_paid_date ON commission_payables(paid_date);
CREATE INDEX IF NOT EXISTS idx_queue_events_created_at ON queue_events(created_at);
