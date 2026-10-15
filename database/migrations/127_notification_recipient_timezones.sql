-- Store the recipient timezone used when evaluating quiet-hour boundaries.
ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS time_zone VARCHAR(80) NOT NULL DEFAULT 'Africa/Cairo';

ALTER TABLE notification_preferences
    DROP CONSTRAINT IF EXISTS notification_preferences_time_zone_check;

ALTER TABLE notification_preferences
    ADD CONSTRAINT notification_preferences_time_zone_check
    CHECK (length(trim(time_zone)) > 0);
