-- Payroll calculation resilience.
-- Employees without an active in-scope compensation profile no longer block
-- the whole run; they are skipped and recorded on the run for reviewer
-- visibility, with an HR/Admin notification.

ALTER TABLE payroll_runs
    ADD COLUMN IF NOT EXISTS skipped_employees JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO notification_event_catalog (event_type, category, default_priority, default_channels, description, required_variables) VALUES
('PayrollEmployeesSkipped', 'Operational', 'Action', '{InApp}', 'A payroll calculation skipped employees without compensation profiles', '["period_name", "skipped_count", "employee_names"]'::jsonb)
ON CONFLICT (event_type) DO NOTHING;

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority,
     inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled) VALUES
('PayrollEmployeesSkipped', NULL, 'Admin', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
('PayrollEmployeesSkipped', NULL, 'HR', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO NOTHING;

INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
('PayrollEmployeesSkipped', 'InApp', 'en', 'Payroll Skipped Employees',
 'Payroll run {{period_name}} was calculated without {{skipped_count}} employee(s) because they have no active compensation profile.\n\n{{employee_names}}\n\nAdd their compensation profiles and recalculate before approval if they should be paid.')
ON CONFLICT (event_type, channel, language) DO NOTHING;
