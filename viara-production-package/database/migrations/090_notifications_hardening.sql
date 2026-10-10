-- Notification hardening: staff read receipts, audience metadata, and safer job dispatch state.

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS audience_type VARCHAR(20) NOT NULL DEFAULT 'Global'
        CHECK (audience_type IN ('Global', 'Staff', 'Patient', 'Doctor')),
    ADD COLUMN IF NOT EXISTS audience_role VARCHAR(50),
    ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'Normal'
        CHECK (priority IN ('Normal', 'Action', 'Warning', 'Critical'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_status_check
    CHECK (status IN ('Pending', 'Sent', 'Delivered', 'Failed'));

UPDATE notifications
SET audience_type = CASE
        WHEN patient_id IS NOT NULL THEN 'Patient'
        WHEN referring_doctor_id IS NOT NULL THEN 'Doctor'
        ELSE audience_type
    END
WHERE audience_type = 'Global';

UPDATE notifications
SET audience_role = 'Marketing'
WHERE audience_role IS NULL
  AND event_type = 'MarketingCampaign';

CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id UUID NOT NULL REFERENCES notifications(notification_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE notification_jobs
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS locked_by TEXT,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS recipient_contact_enc TEXT,
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'Normal'
        CHECK (priority IN ('Normal', 'Action', 'Warning', 'Critical'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_jobs_idempotency
    ON notification_jobs(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_reads_user
    ON notification_reads(user_id, read_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_audience
    ON notifications(audience_type, audience_role, recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_status_created
    ON notifications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_next_retry
    ON notification_jobs(status, next_retry_at, scheduled_for)
    WHERE status IN ('Pending', 'Processing');
