-- Quarantine notification jobs that exhausted their retry budget.
ALTER TABLE notification_jobs
    DROP CONSTRAINT IF EXISTS notification_jobs_status_check;

ALTER TABLE notification_jobs
    ADD CONSTRAINT notification_jobs_status_check
    CHECK (status IN ('Pending', 'Processing', 'Sent', 'Failed', 'DeadLetter', 'Cancelled', 'Skipped'));

CREATE INDEX IF NOT EXISTS idx_notification_jobs_dead_letter
    ON notification_jobs (processed_at DESC, job_id)
    WHERE status = 'DeadLetter';
