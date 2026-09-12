-- Extend partial-payment exception handling through the clinical workflow.
-- Nurses request approval before handing a partially-paid case to modality;
-- technicians request approval before starting the examination.

INSERT INTO role_permissions (role_name, permission_id)
SELECT role_name::user_role, permission_id
FROM (VALUES ('Nurse'), ('Technician')) AS roles(role_name)
CROSS JOIN permissions
WHERE name = 'REQUEST_PARTIAL_PAYMENT_EXCEPTION'
ON CONFLICT DO NOTHING;

UPDATE notification_event_catalog
SET category = 'Financial',
    default_priority = 'Warning',
    default_channels = ARRAY['InApp'],
    description = 'Partial payment exception request and clinical workflow decision',
    required_variables = '["invoice_number", "status", "target_stage"]'::jsonb
WHERE event_type = 'PartialPaymentException';

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority,
     inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled)
VALUES
    ('PartialPaymentException', NULL, 'Receptionist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
    ('PartialPaymentException', NULL, 'Cashier', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
    ('PartialPaymentException', NULL, 'Accountant', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
    ('PartialPaymentException', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
    ('PartialPaymentException', NULL, 'Nurse', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
    ('PartialPaymentException', NULL, 'Technician', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO notification_templates
    (event_type, channel, language, subject, body, is_active)
VALUES
    (
        'PartialPaymentException', 'InApp', 'ar',
        'تحديث طلب الاستثناء المالي',
        'حالة الطلب: {{status}}\nالمريض: {{patient_name}}\nالفاتورة: {{invoice_number}}\nالخطوة المطلوبة: {{target_stage}}\nالمتبقي: {{amount}}\nالسبب: {{reason}}\nملاحظات المراجعة: {{review_notes}}',
        TRUE
    ),
    (
        'PartialPaymentException', 'InApp', 'en',
        'Financial Exception Request Update',
        'Status: {{status}}\nPatient: {{patient_name}}\nInvoice: {{invoice_number}}\nRequested step: {{target_stage}}\nBalance: {{amount}}\nReason: {{reason}}\nReview notes: {{review_notes}}',
        TRUE
    )
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
