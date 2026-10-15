-- Performance: hot-path covering indexes identified by the 2026-09-12 deep audit.
-- Every index below backs a measured hot query (radiologist patient lists, invoice
-- detail payment lookups, analytics date filters, refund per-payment reservation,
-- case-insensitive email login). All statements are idempotent so the migration
-- is safe to re-apply on environments that hot-fixed indexes manually.

-- 1) examinations(patient_id): clinicalPatientScope EXISTS subquery runs per patient
--    row for Radiologist/Nurse/Technician staff lists and patient-history joins.
CREATE INDEX IF NOT EXISTS idx_examinations_patient ON examinations (patient_id);

-- 2) payments(invoice_id): invoice detail "SELECT * FROM payments WHERE invoice_id = $1",
--    case-report LATERAL last-payment lookups, and dashboard finance CTEs.
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id);

-- 3) invoices(patient_id): getInvoices patientId filter and patient financial history.
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices (patient_id);

-- 4-6) examinations timestamp columns: analytics/dashboard date-range filters are
--     sargable (col >= $1::date) but were unindexed, forcing sequential scans.
CREATE INDEX IF NOT EXISTS idx_examinations_exam_started_at ON examinations (exam_started_at);
CREATE INDEX IF NOT EXISTS idx_examinations_exam_completed_at ON examinations (exam_completed_at);
CREATE INDEX IF NOT EXISTS idx_examinations_arrived_at ON examinations (arrived_at);

-- 7) refunds(payment_id): per-payment refund reservation sums before creating a new refund.
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds (payment_id);

-- 8) users(LOWER(email)): login matches on LOWER(email), defeating the unique index
--    on the raw column.
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
