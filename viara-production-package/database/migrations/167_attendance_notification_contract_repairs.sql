-- Complete attendance notification contracts and repair the transactional
-- scheduling paths introduced by the advanced attendance workflow.

INSERT INTO notification_event_catalog
    (event_type, category, default_priority, default_channels, description, required_variables)
VALUES
('AttendanceEmergencyDeparture', 'Operational', 'Warning', '{InApp}',
 'Employee completed an emergency early departure',
 '["employee_name", "early_minutes", "reason"]'::jsonb)
ON CONFLICT (event_type) DO UPDATE SET
    category = EXCLUDED.category,
    default_priority = EXCLUDED.default_priority,
    default_channels = EXCLUDED.default_channels,
    description = EXCLUDED.description,
    required_variables = EXCLUDED.required_variables;

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority,
     inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled)
SELECT event_type, NULL, role, ARRAY['InApp'], min_priority, TRUE, FALSE, FALSE, FALSE
FROM (VALUES
    ('AttendanceEmergencyDeparture', 'Admin', 'Warning'),
    ('AttendanceEmergencyDeparture', 'HR', 'Warning'),
    ('AttendanceUnscheduled', 'Admin', 'Warning'),
    ('AttendanceUnscheduled', 'HR', 'Warning'),
    ('AttendancePermissionResolved', 'Admin', 'Normal'),
    ('AttendancePermissionResolved', 'Developer', 'Normal'),
    ('AttendancePermissionResolved', 'HR', 'Normal'),
    ('AttendancePermissionResolved', 'Radiologist', 'Normal'),
    ('AttendancePermissionResolved', 'Technician', 'Normal'),
    ('AttendancePermissionResolved', 'Nurse', 'Normal'),
    ('AttendancePermissionResolved', 'Receptionist', 'Normal'),
    ('AttendancePermissionResolved', 'Cashier', 'Normal'),
    ('AttendancePermissionResolved', 'Accountant', 'Normal'),
    ('AttendancePermissionResolved', 'Insurance_Staff', 'Normal'),
    ('AttendancePermissionResolved', 'Marketing', 'Normal')
) AS policies(event_type, role, min_priority)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled;

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active) VALUES
('AttendanceUnscheduled', 'InApp', 'ar', 'حضور دون وردية مجدولة',
 'سجل الموظف {{employee_name}} حضورًا دون وردية مجدولة في {{clock_in}}.' , TRUE),
('AttendanceUnscheduled', 'InApp', 'en', 'Unscheduled Clock-In',
 'Staff {{employee_name}} clocked in without a scheduled shift at {{clock_in}}.', TRUE),
('AttendanceEmergencyDeparture', 'InApp', 'ar', 'انصراف طارئ',
 'سجل الموظف {{employee_name}} انصرافًا طارئًا قبل نهاية الوردية بـ {{early_minutes}} دقيقة. السبب: {{reason}}', TRUE),
('AttendanceEmergencyDeparture', 'InApp', 'en', 'Emergency Departure',
 'Staff {{employee_name}} completed an emergency departure {{early_minutes}} minutes before shift end. Reason: {{reason}}', TRUE),
('AttendancePermissionResolved', 'InApp', 'ar', 'تحديث طلب إذن الحضور',
 'تم تحديث طلب إذن {{permission_type}} للموظف {{employee_name}} إلى الحالة {{status}}.', TRUE),
('AttendancePermissionResolved', 'InApp', 'en', 'Attendance Permission Update',
 'The {{permission_type}} request for {{employee_name}} is now {{status}}.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

UPDATE notification_templates
SET subject = COALESCE(NULLIF(split_part(body, E'\n', 1), ''), 'إشعار نظام VIARA'),
    updated_at = CURRENT_TIMESTAMP
WHERE language = 'ar'
  AND channel = 'InApp'
  AND is_active = TRUE
  AND subject IS NULL;