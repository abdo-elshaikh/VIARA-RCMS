-- Repair notification preference ownership and align stored defaults with the API.

ALTER TABLE notification_preferences
    DROP CONSTRAINT IF EXISTS chk_pref_single_owner;

-- Ownerless rows cannot be addressed. For malformed multi-owner rows, retain the
-- original patient/doctor precedence and use staff only when neither is present.
DELETE FROM notification_preferences
WHERE patient_id IS NULL
  AND doctor_id IS NULL
  AND staff_user_id IS NULL;

UPDATE notification_preferences
SET doctor_id = CASE WHEN patient_id IS NULL THEN doctor_id ELSE NULL END,
    staff_user_id = CASE
        WHEN patient_id IS NULL AND doctor_id IS NULL THEN staff_user_id
        ELSE NULL
    END
WHERE num_nonnulls(patient_id, doctor_id, staff_user_id) > 1;

WITH ranked AS (
    SELECT preference_id,
           ROW_NUMBER() OVER (
               PARTITION BY patient_id
               ORDER BY updated_at DESC NULLS LAST, preference_id DESC
           ) AS row_number
    FROM notification_preferences
    WHERE patient_id IS NOT NULL
)
DELETE FROM notification_preferences np
USING ranked
WHERE np.preference_id = ranked.preference_id
  AND ranked.row_number > 1;

WITH ranked AS (
    SELECT preference_id,
           ROW_NUMBER() OVER (
               PARTITION BY doctor_id
               ORDER BY updated_at DESC NULLS LAST, preference_id DESC
           ) AS row_number
    FROM notification_preferences
    WHERE doctor_id IS NOT NULL
)
DELETE FROM notification_preferences np
USING ranked
WHERE np.preference_id = ranked.preference_id
  AND ranked.row_number > 1;

WITH ranked AS (
    SELECT preference_id,
           ROW_NUMBER() OVER (
               PARTITION BY staff_user_id
               ORDER BY updated_at DESC NULLS LAST, preference_id DESC
           ) AS row_number
    FROM notification_preferences
    WHERE staff_user_id IS NOT NULL
)
DELETE FROM notification_preferences np
USING ranked
WHERE np.preference_id = ranked.preference_id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_preferences_patient
    ON notification_preferences(patient_id)
    WHERE patient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_preferences_doctor
    ON notification_preferences(doctor_id)
    WHERE doctor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_prefs_staff
    ON notification_preferences(staff_user_id)
    WHERE staff_user_id IS NOT NULL;

ALTER TABLE notification_preferences
    ADD CONSTRAINT chk_pref_single_owner
    CHECK (num_nonnulls(patient_id, doctor_id, staff_user_id) = 1);

-- Preserve explicit existing opt-outs. Only null legacy values are repaired;
-- defaults below govern rows created after this migration.
UPDATE notification_preferences
SET inapp_enabled = COALESCE(inapp_enabled, TRUE),
    notify_security_event = COALESCE(notify_security_event, TRUE),
    notify_staff_lifecycle = COALESCE(notify_staff_lifecycle, TRUE),
    notify_order_events = COALESCE(notify_order_events, TRUE),
    notify_queue_change = COALESCE(notify_queue_change, TRUE),
    notify_pacs_alert = COALESCE(notify_pacs_alert, TRUE),
    notify_backup_status = COALESCE(notify_backup_status, TRUE),
    notify_privacy_request = COALESCE(notify_privacy_request, TRUE),
    notify_chat_message = COALESCE(notify_chat_message, TRUE),
    notify_inventory_expiry = COALESCE(notify_inventory_expiry, TRUE),
    notify_claim_update = COALESCE(notify_claim_update, TRUE),
    notify_payment_update = COALESCE(notify_payment_update, TRUE),
    quiet_hours_enabled = COALESCE(quiet_hours_enabled, FALSE),
    quiet_hours_start = COALESCE(quiet_hours_start, 22),
    quiet_hours_end = COALESCE(quiet_hours_end, 7)
WHERE staff_user_id IS NOT NULL;

ALTER TABLE notification_preferences
    ALTER COLUMN inapp_enabled SET DEFAULT TRUE,
    ALTER COLUMN notify_security_event SET DEFAULT TRUE,
    ALTER COLUMN notify_staff_lifecycle SET DEFAULT TRUE,
    ALTER COLUMN notify_order_events SET DEFAULT TRUE,
    ALTER COLUMN notify_queue_change SET DEFAULT TRUE,
    ALTER COLUMN notify_pacs_alert SET DEFAULT TRUE,
    ALTER COLUMN notify_backup_status SET DEFAULT TRUE,
    ALTER COLUMN notify_privacy_request SET DEFAULT TRUE,
    ALTER COLUMN notify_chat_message SET DEFAULT TRUE,
    ALTER COLUMN notify_inventory_expiry SET DEFAULT TRUE,
    ALTER COLUMN notify_claim_update SET DEFAULT TRUE,
    ALTER COLUMN notify_payment_update SET DEFAULT TRUE,
    ALTER COLUMN quiet_hours_enabled SET DEFAULT FALSE,
    ALTER COLUMN quiet_hours_start SET DEFAULT 22,
    ALTER COLUMN quiet_hours_end SET DEFAULT 7;
