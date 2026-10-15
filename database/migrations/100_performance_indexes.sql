-- Database Performance Optimizations
-- Add composite indexes for common query patterns

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Examinations: Filter by status and date (worklist queries)
CREATE INDEX IF NOT EXISTS idx_examinations_status_date 
ON examinations(status, created_at DESC) 
WHERE status != 'Finalized';

-- Examinations: Filter by radiologist and status
CREATE INDEX IF NOT EXISTS idx_examinations_radiologist_status 
ON examinations(performing_radiologist_id, status)
WHERE status IN ('Reporting', 'Scanning');

-- Appointments: Date-based queries for scheduling
CREATE INDEX IF NOT EXISTS idx_appointments_date_modality 
ON appointments(start_time, modality_id)
WHERE status != 'Cancelled';

-- Appointments: Patient lookup
CREATE INDEX IF NOT EXISTS idx_appointments_patient_date
ON appointments(patient_id, start_time DESC);

-- Invoices: Financial reporting queries
CREATE INDEX IF NOT EXISTS idx_invoices_status_date 
ON invoices(status, generated_at DESC);

-- Invoices: Outstanding claims
CREATE INDEX IF NOT EXISTS idx_invoices_status_amount
ON invoices(status, patient_payable_amount)
WHERE status = 'Pending';

-- System Logs: Audit queries by user and time
CREATE INDEX IF NOT EXISTS idx_audit_user_time 
ON system_logs(user_id, timestamp DESC);

-- System Logs: Filter by action type
CREATE INDEX IF NOT EXISTS idx_audit_action_time
ON system_logs(action, timestamp DESC);

-- Patients: Full-text search optimization (for patient search)
-- Note: For encrypted fields, search will need to be handled at application layer
CREATE INDEX IF NOT EXISTS idx_patients_mrn_trgm
ON patients USING gin(mrn gin_trgm_ops);

-- Users: Active users lookup
CREATE INDEX IF NOT EXISTS idx_users_active_role
ON users(is_active, role)
WHERE is_active = TRUE;

-- Analyze tables to update statistics for query planner
ANALYZE patients;
ANALYZE appointments;
ANALYZE examinations;
ANALYZE invoices;
ANALYZE system_logs;
ANALYZE users;
