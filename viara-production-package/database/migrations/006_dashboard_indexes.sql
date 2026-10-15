-- Dashboard Statistics Optimization Indexes
-- Migration 006: Add indexes for dashboard statistics queries

-- Index for appointment date range filtering (used in receptionist stats)
CREATE INDEX IF NOT EXISTS idx_appointments_start_time 
ON appointments(start_time)
WHERE status != 'Cancelled';

-- Index for examination status and radiologist filtering (used in radiologist stats)
CREATE INDEX IF NOT EXISTS idx_examinations_status_radiologist 
ON examinations(status, performing_radiologist_id);

-- Index for examination finalization date (used in completed reports count)
CREATE INDEX IF NOT EXISTS idx_examinations_finalized_date 
ON examinations(report_finalized_at)
WHERE status = 'Finalized';

-- Index for payment transaction date (used in revenue calculations)
CREATE INDEX IF NOT EXISTS idx_payments_transaction_date 
ON payments(transaction_date);

-- Index for user active status (used in active staff count)
CREATE INDEX IF NOT EXISTS idx_users_active 
ON users(is_active)
WHERE is_active = TRUE;

-- Composite index for examination modality and date (used in modality distribution)
CREATE INDEX IF NOT EXISTS idx_examinations_modality_created 
ON examinations(modality_id, created_at);

COMMENT ON INDEX idx_appointments_start_time IS 'Dashboard: appointment date filtering';
COMMENT ON INDEX idx_examinations_status_radiologist IS 'Dashboard: radiologist workload queries';
COMMENT ON INDEX idx_examinations_finalized_date IS 'Dashboard: completed reports by date';
COMMENT ON INDEX idx_payments_transaction_date IS 'Dashboard: revenue calculations by date';
COMMENT ON INDEX idx_users_active IS 'Dashboard: active staff count';
COMMENT ON INDEX idx_examinations_modality_created IS 'Dashboard: scan volume by modality';
