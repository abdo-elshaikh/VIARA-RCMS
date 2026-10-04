-- Payroll lifecycle hardening.
-- 1. Break the single-accountant payment deadlock: approval and payment now
--    have distinct eligible roles (Accountant approves, Admin can pay), and
--    locking a paid run is grantable instead of dormant.
-- 2. Notification events for the payroll maker-checker chain and the penalty
--    acknowledgement / dispute workflow.

INSERT INTO role_permissions (role_name, permission_id)
SELECT role_name::user_role, p.permission_id
FROM (VALUES
    ('Admin', 'PAY_PAYROLL'),
    ('Admin', 'LOCK_PAYROLL'),
    ('Developer', 'PAY_PAYROLL'),
    ('Developer', 'LOCK_PAYROLL')
) AS grants(role_name, permission_name)
JOIN permissions p ON p.name = grants.permission_name
ON CONFLICT DO NOTHING;

INSERT INTO notification_event_catalog (event_type, category, default_priority, default_channels, description, required_variables) VALUES
('PayrollRunStatusChanged', 'Operational', 'Action', '{InApp}', 'A payroll run moved to a new maker-checker stage', '["period_name", "status"]'::jsonb),
('PenaltyImposed', 'Operational', 'Warning', '{InApp}', 'An approved penalty was imposed on an employee', '["penalty_type", "amount"]'::jsonb),
('PenaltyDisputed', 'Operational', 'Action', '{InApp}', 'An employee disputed an approved penalty; it is excluded from calculation until resolved', '["penalty_type", "amount"]'::jsonb),
('PenaltyDisputeResolved', 'Operational', 'Normal', '{InApp}', 'A penalty dispute was resolved', '["outcome", "penalty_type"]'::jsonb),
('PenaltyCancelled', 'Operational', 'Normal', '{InApp}', 'An approved penalty was cancelled before it was applied', '["penalty_type", "amount"]'::jsonb)
ON CONFLICT (event_type) DO NOTHING;

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority,
     inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled)
VALUES
-- Payroll chain stakeholders.
('PayrollRunStatusChanged', NULL, 'Admin', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
('PayrollRunStatusChanged', NULL, 'Accountant', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
('PayrollRunStatusChanged', NULL, 'HR', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
-- Penalty lifecycle goes to the affected employee and to supervisors.
('PenaltyImposed', NULL, 'Receptionist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PenaltyImposed', NULL, 'Radiologist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PenaltyImposed', NULL, 'Technician', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PenaltyImposed', NULL, 'Nurse', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PenaltyImposed', NULL, 'Cashier', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PenaltyImposed', NULL, 'Accountant', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PenaltyImposed', NULL, 'Insurance_Staff', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PenaltyImposed', NULL, 'Marketing', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PenaltyImposed', NULL, 'HR', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PenaltyImposed', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputed', NULL, 'HR', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputed', NULL, 'Admin', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputeResolved', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputeResolved', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputeResolved', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputeResolved', NULL, 'Nurse', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputeResolved', NULL, 'Cashier', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputeResolved', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputeResolved', NULL, 'Insurance_Staff', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputeResolved', NULL, 'Marketing', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyDisputeResolved', NULL, 'HR', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyCancelled', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyCancelled', NULL, 'HR', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PenaltyCancelled', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO NOTHING;

INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
('PayrollRunStatusChanged', 'InApp', 'en', 'Payroll Run Update',
 'Payroll run {{period_name}} moved to {{status}}.\n\nNet total: {{total_net}} {{currency_code}}'),
('PenaltyImposed', 'InApp', 'en', 'Penalty Imposed',
 'An approved penalty was recorded against you.\n\nType: {{penalty_type}}\nAmount: {{amount}}\nReason: {{reason}}\n\nYou can acknowledge it or file a dispute from your penalties page.'),
('PenaltyDisputed', 'InApp', 'en', 'Penalty Disputed',
 'An employee disputed a penalty; it is excluded from payroll calculation until resolved.\n\nType: {{penalty_type}}\nAmount: {{amount}}\nDispute reason: {{dispute_reason}}'),
('PenaltyDisputeResolved', 'InApp', 'en', 'Penalty Dispute Resolved',
 'Your penalty dispute was resolved.\n\nOutcome: {{outcome}}\nType: {{penalty_type}}\nResolution: {{resolution}}'),
('PenaltyCancelled', 'InApp', 'en', 'Penalty Cancelled',
 'An approved penalty was cancelled before it was applied.\n\nType: {{penalty_type}}\nAmount: {{amount}}\nReason: {{reason}}')
ON CONFLICT (event_type, channel, language) DO NOTHING;
