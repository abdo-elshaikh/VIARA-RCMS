-- Govern emergency access as a revocable, attributable, high-risk grant.

ALTER TABLE emergency_access_logs
    ADD COLUMN IF NOT EXISTS grant_id UUID DEFAULT uuid_generate_v4(),
    ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT ARRAY['VIEW_PATIENTS', 'VIEW_EXAMS', 'VIEW_REPORTS', 'VIEW_PACS_IMAGES']::text[],
    ADD COLUMN IF NOT EXISTS reason_enc TEXT,
    ADD COLUMN IF NOT EXISTS session_id UUID,
    ADD COLUMN IF NOT EXISTS ip_address TEXT,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS revoke_reason TEXT,
    ADD COLUMN IF NOT EXISTS revoke_reason_enc TEXT,
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE;

UPDATE emergency_access_logs
SET grant_id = uuid_generate_v4()
WHERE grant_id IS NULL;

ALTER TABLE emergency_access_logs
    ALTER COLUMN grant_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_emergency_access_grant_id
    ON emergency_access_logs(grant_id);

CREATE INDEX IF NOT EXISTS idx_emergency_access_active_user
    ON emergency_access_logs(user_id, expires_at DESC)
    WHERE status = 'Active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_emergency_access_active_session
    ON emergency_access_logs(user_id, session_id)
    WHERE status = 'Active' AND session_id IS NOT NULL;

ALTER TABLE emergency_access_logs
    DROP CONSTRAINT IF EXISTS chk_emergency_access_reason_length;

ALTER TABLE emergency_access_logs
    ADD CONSTRAINT chk_emergency_access_reason_length
    CHECK (char_length(btrim(reason)) BETWEEN 20 AND 1000) NOT VALID;

INSERT INTO notification_event_catalog (
    event_type, category, default_priority, default_channels, description, required_variables
) VALUES (
    'EmergencyAccessGranted',
    'Security',
    'Critical',
    ARRAY['InApp', 'Email'],
    'A clinical user activated governed emergency access',
    '["actor_name", "actor_role", "grant_id", "expires_at"]'::jsonb
)
ON CONFLICT (event_type) DO UPDATE SET
    category = EXCLUDED.category,
    default_priority = EXCLUDED.default_priority,
    default_channels = EXCLUDED.default_channels,
    description = EXCLUDED.description,
    required_variables = EXCLUDED.required_variables;

INSERT INTO notification_audience_policies (
    event_type, event_category, role, allowed_channels, min_priority,
    inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled
) VALUES
    ('EmergencyAccessGranted', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Critical', TRUE, TRUE, FALSE, FALSE),
    ('EmergencyAccessGranted', NULL, 'Developer', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active) VALUES
    ('EmergencyAccessGranted', 'InApp', 'en', 'Emergency access activated', '{{actor_name}} ({{actor_role}}) activated emergency access. Grant: {{grant_id}}. Expires: {{expires_at}}.', TRUE),
    ('EmergencyAccessGranted', 'Email', 'en', 'VIARA security alert: emergency access activated', '{{actor_name}} ({{actor_role}}) activated emergency access. Grant: {{grant_id}}. Expires: {{expires_at}}. Review the RBAC audit log immediately.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
