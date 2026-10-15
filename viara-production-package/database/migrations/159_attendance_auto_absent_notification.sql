-- Attendance auto-absent notification: the shift guard marks unattended
-- shifts as Absent and must notify the affected employee.
-- Follows the catalog + audience policy + template seeding convention.

INSERT INTO notification_event_catalog (event_type, category, default_priority, default_channels, description) VALUES
('AttendanceAutoAbsent', 'Operational', 'Warning', '{InApp}', 'An unattended shift was automatically marked absent')
ON CONFLICT (event_type) DO NOTHING;

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority,
     inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled) VALUES
-- Auto-absent shifts notify the affected employee and HR oversight.
('AttendanceAutoAbsent', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'HR', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'Receptionist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'Radiologist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'Technician', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'Nurse', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'Cashier', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'Accountant', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'Insurance_Staff', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'Marketing', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO NOTHING;

INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
('AttendanceAutoAbsent', 'InApp', 'en', 'Shift Marked Absent',
 'Your shift was closed automatically because it was left unattended.\n\nEmployee: {{employee_name}}\nShift date: {{shift_date}}\nContact HR if this is incorrect.')
ON CONFLICT (event_type, channel, language) DO NOTHING;
