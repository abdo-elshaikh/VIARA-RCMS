-- Support bounded notification retention and payload-redaction sweeps.
CREATE INDEX IF NOT EXISTS idx_notification_jobs_terminal_retention
    ON notification_jobs ((COALESCE(processed_at, created_at)), job_id)
    WHERE status IN ('Sent', 'Failed', 'Cancelled', 'Skipped');

CREATE INDEX IF NOT EXISTS idx_notifications_general_retention
    ON notifications (created_at, notification_id)
    WHERE priority <> 'Critical';
