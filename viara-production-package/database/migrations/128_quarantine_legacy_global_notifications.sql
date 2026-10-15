-- Legacy rows without an owner must not be visible to every staff role.
-- Keep them available to administrators for controlled review and migration.
UPDATE notifications
SET audience_type = 'Staff',
    audience_role = 'Admin'
WHERE audience_type = 'Global'
  AND patient_id IS NULL
  AND referring_doctor_id IS NULL
  AND recipient_user_id IS NULL
  AND (audience_role IS NULL OR audience_role = '');

CREATE INDEX IF NOT EXISTS idx_notifications_admin_quarantine
    ON notifications (created_at DESC)
    WHERE audience_type = 'Staff' AND audience_role = 'Admin';
