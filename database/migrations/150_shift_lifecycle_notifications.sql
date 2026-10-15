-- Shift lifecycle notifications: cashier variance review, leave workflow,
-- and automatic settlement of abandoned attendance/reception shifts.
-- Follows the catalog + audience policy + template seeding convention.

INSERT INTO notification_event_catalog (event_type, category, default_priority, default_channels, description) VALUES
('CASHIER_VARIANCE_REQUIRES_REVIEW', 'Financial', 'Action', '{InApp, Email}', 'A cashier shift was closed with a material cash variance and requires manager review'),
('LEAVE_REQUEST_SUBMITTED', 'Operational', 'Action', '{InApp}', 'An employee submitted a leave request awaiting HR review'),
('LEAVE_REQUEST_DECIDED', 'Operational', 'Normal', '{InApp}', 'A leave request was approved or rejected'),
('ATTENDANCE_SESSION_AUTO_CAPPED', 'Operational', 'Warning', '{InApp}', 'An abandoned attendance session was automatically capped'),
('RECEPTION_SHIFT_AUTO_CLOSED', 'Operational', 'Warning', '{InApp}', 'An abandoned reception shift was automatically closed after heartbeat timeout')
ON CONFLICT (event_type) DO NOTHING;

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority,
     inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled) VALUES
-- Variance review goes to the roles holding APPROVE_SHIFT_VARIANCE.
('CASHIER_VARIANCE_REQUIRES_REVIEW', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Action', TRUE, TRUE, FALSE, FALSE),
('CASHIER_VARIANCE_REQUIRES_REVIEW', NULL, 'Accountant', ARRAY['InApp', 'Email'], 'Action', TRUE, TRUE, FALSE, FALSE),
('CASHIER_VARIANCE_REQUIRES_REVIEW', NULL, 'Developer', ARRAY['InApp', 'Email'], 'Action', TRUE, TRUE, FALSE, FALSE),
-- Leave intake for reviewers.
('LEAVE_REQUEST_SUBMITTED', NULL, 'HR', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
('LEAVE_REQUEST_SUBMITTED', NULL, 'Admin', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
-- Leave decision goes to the requesting employee.
('LEAVE_REQUEST_DECIDED', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('LEAVE_REQUEST_DECIDED', NULL, 'HR', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('LEAVE_REQUEST_DECIDED', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('LEAVE_REQUEST_DECIDED', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('LEAVE_REQUEST_DECIDED', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('LEAVE_REQUEST_DECIDED', NULL, 'Nurse', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('LEAVE_REQUEST_DECIDED', NULL, 'Cashier', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('LEAVE_REQUEST_DECIDED', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('LEAVE_REQUEST_DECIDED', NULL, 'Insurance_Staff', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('LEAVE_REQUEST_DECIDED', NULL, 'Marketing', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
-- Capped sessions notify the affected employee.
('ATTENDANCE_SESSION_AUTO_CAPPED', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('ATTENDANCE_SESSION_AUTO_CAPPED', NULL, 'HR', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('ATTENDANCE_SESSION_AUTO_CAPPED', NULL, 'Receptionist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('ATTENDANCE_SESSION_AUTO_CAPPED', NULL, 'Radiologist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('ATTENDANCE_SESSION_AUTO_CAPPED', NULL, 'Technician', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('ATTENDANCE_SESSION_AUTO_CAPPED', NULL, 'Nurse', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('ATTENDANCE_SESSION_AUTO_CAPPED', NULL, 'Cashier', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('ATTENDANCE_SESSION_AUTO_CAPPED', NULL, 'Accountant', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('ATTENDANCE_SESSION_AUTO_CAPPED', NULL, 'Insurance_Staff', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('ATTENDANCE_SESSION_AUTO_CAPPED', NULL, 'Marketing', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
-- Auto-closed reception shifts notify the owner and supervisors.
('RECEPTION_SHIFT_AUTO_CLOSED', NULL, 'Receptionist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('RECEPTION_SHIFT_AUTO_CLOSED', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('RECEPTION_SHIFT_AUTO_CLOSED', NULL, 'Developer', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO NOTHING;

INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
('CASHIER_VARIANCE_REQUIRES_REVIEW', 'InApp', 'en', 'Cashier Variance Requires Review',
 'A cashier shift was closed with a material cash variance.\n\nCashier: {{cashier_name}}\nExpected: {{expected_cash}}\nCounted: {{counted_cash}}\nVariance: {{variance}}\nBusiness Date: {{business_date}}'),
('CASHIER_VARIANCE_REQUIRES_REVIEW', 'Email', 'en', 'Cashier Variance Requires Review',
 'Dear {{recipient_name}},\n\nA cashier shift was closed with a material cash variance and requires review before the cashier can open a new shift.\n\nCashier: {{cashier_name}}\nExpected: {{expected_cash}}\nCounted: {{counted_cash}}\nVariance: {{variance}}\nBusiness Date: {{business_date}}\n\nRegards,\nVIARA Billing'),
('LEAVE_REQUEST_SUBMITTED', 'InApp', 'en', 'New Leave Request',
 'A leave request is awaiting review.\n\nEmployee: {{employee_name}}\nType: {{leave_type}}\nFrom: {{start_date}}\nTo: {{end_date}}'),
('LEAVE_REQUEST_DECIDED', 'InApp', 'en', 'Leave Request Reviewed',
 'Your leave request has been reviewed.\n\nStatus: {{status}}\nType: {{leave_type}}\nFrom: {{start_date}}\nTo: {{end_date}}{{#if review_notes}}\nNotes: {{review_notes}}{{/if}}'),
('ATTENDANCE_SESSION_AUTO_CAPPED', 'InApp', 'en', 'Attendance Session Auto-Capped',
 'An open attendance session was automatically capped.\n\nEmployee: {{employee_name}}\nClock-in: {{clock_in}}\nCapped clock-out: {{clock_out}}\nContact HR if this is incorrect.'),
('RECEPTION_SHIFT_AUTO_CLOSED', 'InApp', 'en', 'Reception Shift Auto-Closed',
 'A reception shift was closed automatically after its owner stopped responding.\n\nDesk: {{desk_identifier}}\nIdle for: {{abandoned_minutes}} minutes')
ON CONFLICT (event_type, channel, language) DO NOTHING;
