-- Emergency access revocation notifications + permission set alignment.

-- Keep the column default in sync with EMERGENCY_ACCESS_PERMISSIONS in
-- emergencyAccessService.js (VIEW_APPOINTMENTS was added as a read-only grant
-- so break-glass clinicians can see the full schedule).
ALTER TABLE emergency_access_logs
    ALTER COLUMN permissions SET DEFAULT ARRAY['VIEW_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS', 'VIEW_REPORTS', 'VIEW_PACS_IMAGES']::text[];

INSERT INTO notification_event_catalog (
    event_type, category, default_priority, default_channels, description, required_variables
) VALUES (
    'EmergencyAccessRevoked',
    'Security',
    'Critical',
    ARRAY['InApp'],
    'A governed emergency access grant was revoked (self or administrative)',
    '["actor_name", "grant_id", "administrative"]'::jsonb
)
ON CONFLICT (event_type) DO UPDATE SET
    category = EXCLUDED.category,
    default_priority = EXCLUDED.default_priority,
    default_channels = EXCLUDED.default_channels,
    description = EXCLUDED.description,
    required_variables = EXCLUDED.required_variables;

-- The affected clinician (grant owner) plus security governance roles are notified.
INSERT INTO notification_audience_policies (
    event_type, event_category, role, allowed_channels, min_priority,
    inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled
) VALUES
    ('EmergencyAccessRevoked', NULL, 'Radiologist', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE),
    ('EmergencyAccessRevoked', NULL, 'Nurse', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE),
    ('EmergencyAccessRevoked', NULL, 'Technician', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE),
    ('EmergencyAccessRevoked', NULL, 'Admin', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE),
    ('EmergencyAccessRevoked', NULL, 'Developer', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active) VALUES
    ('EmergencyAccessRevoked', 'InApp', 'en', 'Emergency access revoked', '{{actor_name}} ended emergency access grant {{grant_id}} (administrative: {{administrative}}). The elevated permissions are no longer in effect.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
