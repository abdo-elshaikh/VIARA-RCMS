-- Shift request notification contract: reviewers are alerted when a request is filed,
-- and the involved employee(s) are notified when it is decided.

INSERT INTO notification_event_catalog
    (event_type, category, default_priority, default_channels, description, required_variables)
VALUES
    ('SHIFT_REQUEST_SUBMITTED', 'Operational', 'Action', ARRAY['InApp'], 'An employee submitted a shift change request requiring supervisor review', '["employee_name", "request_type", "reason"]'::jsonb),
    ('SHIFT_REQUEST_DECIDED', 'Operational', 'Normal', ARRAY['InApp'], 'A shift request was approved, rejected, or cancelled', '["employee_name", "status", "request_type", "review_notes"]'::jsonb)
ON CONFLICT (event_type) DO UPDATE SET
    category = EXCLUDED.category,
    default_priority = EXCLUDED.default_priority,
    default_channels = EXCLUDED.default_channels,
    description = EXCLUDED.description,
    required_variables = EXCLUDED.required_variables;

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority, inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled)
VALUES
    ('SHIFT_REQUEST_SUBMITTED', NULL, 'HR', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_REQUEST_SUBMITTED', NULL, 'Admin', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_REQUEST_DECIDED', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_REQUEST_DECIDED', NULL, 'Nurse', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_REQUEST_DECIDED', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_REQUEST_DECIDED', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_REQUEST_DECIDED', NULL, 'Cashier', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_REQUEST_DECIDED', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_REQUEST_DECIDED', NULL, 'Insurance_Staff', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_REQUEST_DECIDED', NULL, 'Marketing', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active)
VALUES
    ('SHIFT_REQUEST_SUBMITTED', 'InApp', 'en', 'Shift Request Submitted', 'New shift request submitted by {{employee_name}}.\n\nType: {{request_type}}\nReason: {{reason}}', TRUE),
    ('SHIFT_REQUEST_SUBMITTED', 'InApp', 'ar', 'تم تقديم طلب وردية', 'تم تقديم طلب وردية جديد من قبل {{employee_name}}.\n\nالنوع: {{request_type}}\nالسبب: {{reason}}', TRUE),
    ('SHIFT_REQUEST_DECIDED', 'InApp', 'en', 'Shift Request Updated', 'Your shift request was {{status}}.\n\nType: {{request_type}}\nEmployee: {{employee_name}}{{#if review_notes}}\nNotes: {{review_notes}}{{/if}}', TRUE),
    ('SHIFT_REQUEST_DECIDED', 'InApp', 'ar', 'تم تحديث طلب الوردية', 'تم {{status}} طلب الوردية الخاص بك.\n\nالنوع: {{request_type}}\nالموظف: {{employee_name}}{{#if review_notes}}\nالملاحظات: {{review_notes}}{{/if}}', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
