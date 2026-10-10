-- Explicit equipment operations and critical-result notification workflows.

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS critical_result BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS critical_result_marked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS critical_result_marked_by UUID REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE examinations
    DROP CONSTRAINT IF EXISTS chk_examinations_critical_result_marker,
    ADD CONSTRAINT chk_examinations_critical_result_marker CHECK (
        (critical_result = FALSE AND critical_result_marked_at IS NULL AND critical_result_marked_by IS NULL)
        OR
        (critical_result = TRUE AND critical_result_marked_at IS NOT NULL AND critical_result_marked_by IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_examinations_critical_result
    ON examinations(report_finalized_at DESC)
    WHERE critical_result = TRUE;

CREATE TABLE IF NOT EXISTS critical_result_acknowledgements (
    acknowledgement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    recipient_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    referring_doctor_id UUID REFERENCES referring_doctors(doctor_id) ON DELETE CASCADE,
    recipient_role VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'Acknowledged')),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    acknowledged_by_doctor_id UUID REFERENCES referring_doctors(doctor_id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_critical_ack_recipient CHECK (
        (recipient_user_id IS NOT NULL)::integer + (referring_doctor_id IS NOT NULL)::integer = 1
    ),
    CONSTRAINT chk_critical_ack_state CHECK (
        (status = 'Pending' AND acknowledged_at IS NULL)
        OR
        (status = 'Acknowledged' AND acknowledged_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_critical_ack_exam_user
    ON critical_result_acknowledgements(exam_id, recipient_user_id)
    WHERE recipient_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_critical_ack_exam_doctor
    ON critical_result_acknowledgements(exam_id, referring_doctor_id)
    WHERE referring_doctor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_critical_ack_pending
    ON critical_result_acknowledgements(recipient_role, created_at)
    WHERE status = 'Pending';

INSERT INTO notification_event_catalog (
    event_type, category, default_priority, default_channels, description, required_variables
) VALUES
('EquipmentMaintenanceCreated', 'Operational', 'Normal', ARRAY['InApp'], 'Equipment maintenance record created', '["maintenance_id", "modality_id", "modality_name", "maintenance_type", "scheduled_date", "status"]'::jsonb),
('EquipmentMaintenanceUpdated', 'Operational', 'Action', ARRAY['InApp'], 'Equipment maintenance record updated', '["maintenance_id", "modality_id", "modality_name", "maintenance_type", "scheduled_date", "status", "changed_fields"]'::jsonb),
('EquipmentDowntimeCreated', 'Operational', 'Action', ARRAY['InApp', 'Email'], 'Equipment downtime window created', '["downtime_id", "modality_id", "modality_name", "start_time", "end_time", "reason", "status"]'::jsonb),
('EquipmentDowntimeUpdated', 'Operational', 'Warning', ARRAY['InApp', 'Email'], 'Equipment downtime window updated', '["downtime_id", "modality_id", "modality_name", "start_time", "end_time", "reason", "status", "changed_fields"]'::jsonb),
('EquipmentDowntimeResolved', 'Operational', 'Normal', ARRAY['InApp'], 'Equipment downtime resolved', '["downtime_id", "modality_id", "modality_name", "start_time", "end_time", "reason", "status", "resolution_notes"]'::jsonb),
('CriticalResultFinalized', 'Clinical', 'Critical', ARRAY['InApp', 'Email', 'SMS'], 'Explicitly marked critical diagnostic result finalized; acknowledgement required', '["exam_id", "order_number", "critical_marked_at"]'::jsonb)
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
('EquipmentMaintenanceCreated', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('EquipmentMaintenanceCreated', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('EquipmentMaintenanceUpdated', NULL, 'Technician', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
('EquipmentMaintenanceUpdated', NULL, 'Admin', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
('EquipmentDowntimeCreated', NULL, 'Technician', ARRAY['InApp', 'Email', 'SMS'], 'Action', TRUE, TRUE, TRUE, FALSE),
('EquipmentDowntimeCreated', NULL, 'Receptionist', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
('EquipmentDowntimeCreated', NULL, 'Admin', ARRAY['InApp', 'Email', 'SMS'], 'Action', TRUE, TRUE, TRUE, FALSE),
('EquipmentDowntimeUpdated', NULL, 'Technician', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('EquipmentDowntimeUpdated', NULL, 'Receptionist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('EquipmentDowntimeUpdated', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('EquipmentDowntimeResolved', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('EquipmentDowntimeResolved', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('EquipmentDowntimeResolved', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('CriticalResultFinalized', NULL, 'Radiologist', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('CriticalResultFinalized', NULL, 'Admin', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
('EquipmentMaintenanceCreated', 'InApp', 'en', 'Maintenance Scheduled', 'Maintenance {{maintenance_id}} was created for {{modality_name}} ({{maintenance_type}}) on {{scheduled_date}}. Status: {{status}}.'),
('EquipmentMaintenanceUpdated', 'InApp', 'en', 'Maintenance Updated', 'Maintenance {{maintenance_id}} for {{modality_name}} is now {{status}}. Changed: {{changed_fields}}.'),
('EquipmentDowntimeCreated', 'InApp', 'en', 'Equipment Downtime Created', '{{modality_name}} downtime was created from {{start_time}} to {{end_time}}. Status: {{status}}. Reason: {{reason}}.'),
('EquipmentDowntimeCreated', 'Email', 'en', 'Equipment downtime: {{modality_name}}', '{{modality_name}} downtime was created from {{start_time}} to {{end_time}}. Status: {{status}}. Reason: {{reason}}.'),
('EquipmentDowntimeCreated', 'SMS', 'en', NULL, '{{modality_name}} downtime: {{start_time}} to {{end_time}} ({{status}}).'),
('EquipmentDowntimeUpdated', 'InApp', 'en', 'Equipment Downtime Updated', '{{modality_name}} downtime was updated. Status: {{status}}. Changed: {{changed_fields}}.'),
('EquipmentDowntimeUpdated', 'Email', 'en', 'Equipment downtime updated: {{modality_name}}', '{{modality_name}} downtime was updated. Window: {{start_time}} to {{end_time}}. Status: {{status}}. Changed: {{changed_fields}}.'),
('EquipmentDowntimeResolved', 'InApp', 'en', 'Equipment Downtime Resolved', '{{modality_name}} downtime has been resolved. Resolution: {{resolution_notes}}.'),
('CriticalResultFinalized', 'InApp', 'en', 'Critical Result Requires Acknowledgement', 'Critical result finalized for order {{order_number}} (exam {{exam_id}}). Marked at {{critical_marked_at}}. Acknowledgement is required.'),
('CriticalResultFinalized', 'Email', 'en', 'Critical result requires acknowledgement: {{order_number}}', 'A diagnostic result explicitly marked critical has been finalized. Order: {{order_number}}. Exam: {{exam_id}}. Marked at: {{critical_marked_at}}. Please review and acknowledge promptly.'),
('CriticalResultFinalized', 'SMS', 'en', NULL, 'CRITICAL RESULT: Order {{order_number}} requires prompt review and acknowledgement.'),
('CriticalResultFinalized', 'WhatsApp', 'en', NULL, 'CRITICAL RESULT: Order {{order_number}} (exam {{exam_id}}) requires prompt review and acknowledgement.')
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
