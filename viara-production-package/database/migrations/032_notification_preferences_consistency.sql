-- Phase 12 hardening: enforce one notification preference row per owner.

WITH ranked_patient_preferences AS (
    SELECT preference_id,
           ROW_NUMBER() OVER (
               PARTITION BY patient_id
               ORDER BY updated_at DESC, preference_id DESC
           ) AS row_number
    FROM notification_preferences
    WHERE patient_id IS NOT NULL
)
DELETE FROM notification_preferences np
USING ranked_patient_preferences ranked
WHERE np.preference_id = ranked.preference_id
  AND ranked.row_number > 1;

WITH ranked_doctor_preferences AS (
    SELECT preference_id,
           ROW_NUMBER() OVER (
               PARTITION BY doctor_id
               ORDER BY updated_at DESC, preference_id DESC
           ) AS row_number
    FROM notification_preferences
    WHERE doctor_id IS NOT NULL
)
DELETE FROM notification_preferences np
USING ranked_doctor_preferences ranked
WHERE np.preference_id = ranked.preference_id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_preferences_patient
    ON notification_preferences(patient_id)
    WHERE patient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_preferences_doctor
    ON notification_preferences(doctor_id)
    WHERE doctor_id IS NOT NULL;
