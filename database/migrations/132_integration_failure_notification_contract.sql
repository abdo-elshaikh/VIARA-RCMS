-- Notification contract for dead-lettered external integration deliveries.
INSERT INTO notification_event_catalog (
    event_type, category, default_priority, default_channels, description, required_variables
) VALUES (
    'INTEGRATION_FAILED',
    'System',
    'Critical',
    ARRAY['InApp'],
    'External integration entered the dead-letter queue',
    '["notification_subject", "notification_body", "integration_log_id"]'::jsonb
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
    ('INTEGRATION_FAILED', NULL, 'Admin', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE),
    ('INTEGRATION_FAILED', NULL, 'Developer', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active)
VALUES (
    'INTEGRATION_FAILED', 'InApp', 'en',
    '{{notification_subject}}', '{{notification_body}}', TRUE
)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
