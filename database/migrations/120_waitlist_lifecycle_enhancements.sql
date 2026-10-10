-- Migration 120: Waitlist lifecycle enhancements, expanded statuses, and performance indexes

-- Update check constraints on waiting_list status
ALTER TABLE waiting_list DROP CONSTRAINT IF EXISTS chk_waiting_list_status;
ALTER TABLE waiting_list DROP CONSTRAINT IF EXISTS waiting_list_status_check;

ALTER TABLE waiting_list
    ADD CONSTRAINT chk_waiting_list_status
    CHECK (status IN ('Waiting', 'Contacted', 'Offered', 'Scheduled', 'Declined', 'Expired', 'Cancelled'));

-- Composite index for fast matching on cancellations and daily schedule view
CREATE INDEX IF NOT EXISTS idx_waiting_list_active_matching
    ON waiting_list(modality_id, exam_type_id, preferred_date)
    WHERE status IN ('Waiting', 'Contacted', 'Offered');

CREATE INDEX IF NOT EXISTS idx_waiting_list_status_created
    ON waiting_list(status, created_at DESC);
