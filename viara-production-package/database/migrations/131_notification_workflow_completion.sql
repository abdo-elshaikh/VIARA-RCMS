-- Complete persona-safe patient events, critical-result escalation, and safer
-- notification persistence defaults.

ALTER TABLE notifications
    ALTER COLUMN audience_type DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_provider_message_id
    ON notifications(provider_message_id)
    WHERE provider_message_id IS NOT NULL;

ALTER TABLE critical_result_acknowledgements
    ADD COLUMN IF NOT EXISTS acknowledgement_due_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0;

ALTER TABLE critical_result_acknowledgements
    DROP CONSTRAINT IF EXISTS critical_result_acknowledgements_status_check,
    DROP CONSTRAINT IF EXISTS chk_critical_ack_state;

ALTER TABLE critical_result_acknowledgements
    ADD CONSTRAINT critical_result_acknowledgements_status_check
        CHECK (status IN ('Pending', 'Acknowledged', 'Superseded')),
    ADD CONSTRAINT chk_critical_ack_state CHECK (
        (status IN ('Pending', 'Superseded') AND acknowledged_at IS NULL)
        OR (status = 'Acknowledged' AND acknowledged_at IS NOT NULL)
    );

UPDATE critical_result_acknowledgements
SET acknowledgement_due_at = COALESCE(acknowledgement_due_at, created_at + INTERVAL '15 minutes')
WHERE acknowledgement_due_at IS NULL;

ALTER TABLE critical_result_acknowledgements
    ALTER COLUMN acknowledgement_due_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_critical_ack_escalation_due
    ON critical_result_acknowledgements (acknowledgement_due_at, exam_id)
    WHERE status = 'Pending' AND escalated_at IS NULL;

INSERT INTO notification_event_catalog (
    event_type, category, default_priority, default_channels, description, required_variables
) VALUES
('PatientAppointmentNoShowNotice', 'Clinical', 'Action', ARRAY['InApp', 'Email'], 'Patient-safe appointment no-show notice', '["order_number", "appointment_time"]'::jsonb),
('CriticalResultEscalated', 'Clinical', 'Critical', ARRAY['InApp', 'Email', 'SMS'], 'Critical-result acknowledgement overdue escalation', '["exam_id", "order_number", "overdue_since"]'::jsonb)
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
('CriticalResultEscalated', NULL, 'Admin', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('CriticalResultEscalated', NULL, 'Radiologist', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active) VALUES
('PatientAppointmentNoShowNotice', 'InApp', 'en', 'Appointment attendance update', 'Your appointment for order {{order_number}} at {{appointment_time}} was recorded as missed. Contact the center if you need to reschedule.', TRUE),
('PatientAppointmentNoShowNotice', 'Email', 'en', 'Appointment attendance update', 'Your appointment for order {{order_number}} at {{appointment_time}} was recorded as missed. Contact the center if you need to reschedule. The internal reason is not included in this message.', TRUE),
('CriticalResultEscalated', 'InApp', 'en', 'Critical result acknowledgement overdue', 'Critical result for order {{order_number}} (exam {{exam_id}}) has not been acknowledged since {{overdue_since}}. Immediate escalation action is required.', TRUE),
('CriticalResultEscalated', 'Email', 'en', 'URGENT: critical result acknowledgement overdue', 'Critical result for order {{order_number}} (exam {{exam_id}}) has not been acknowledged since {{overdue_since}}. Review and acknowledge immediately.', TRUE),
('CriticalResultEscalated', 'SMS', 'en', NULL, 'URGENT: Critical result for order {{order_number}} remains unacknowledged. Review VIARA immediately.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
