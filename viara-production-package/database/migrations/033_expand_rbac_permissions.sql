-- Expand the RBAC catalog to cover every operational workspace.
-- Existing grants are preserved; only missing permissions and safe default grants are added.

INSERT INTO permissions (name, module, description) VALUES
('MANAGE_WAITLIST', 'Scheduling', 'Manage the appointment waiting list and scheduling offers'),
('MANAGE_SAFETY', 'Clinical', 'Record and review examination safety screening'),
('REVIEW_REPORTS', 'Clinical', 'Review diagnostic reports before approval'),
('DELIVER_RESULTS', 'Clinical', 'Release and record authorized result delivery'),
('PROCESS_PAYMENTS', 'Billing', 'Collect and reconcile invoice payments'),
('ISSUE_REFUNDS', 'Billing', 'Issue or approve patient payment refunds'),
('VIEW_INSURANCE', 'Insurance', 'View providers, policies, approvals, and claims'),
('MANAGE_INSURANCE_PROVIDERS', 'Insurance', 'Create and maintain insurance providers'),
('MANAGE_INSURANCE_CONTRACTS', 'Insurance', 'Create and maintain payer contracts and coverage rules'),
('MANAGE_INSURANCE_APPROVALS', 'Insurance', 'Request and update preauthorization decisions'),
('MANAGE_INSURANCE_CLAIMS', 'Insurance', 'Create, submit, and reconcile insurance claims'),
('VIEW_FINANCIALS', 'Finance', 'View financial performance and accounting reports'),
('MANAGE_EXPENSES', 'Finance', 'Create and maintain operational expenses'),
('MANAGE_COMMISSIONS', 'Finance', 'Review and settle physician commissions'),
('MANAGE_RECEIVABLES', 'Finance', 'Review and manage outstanding receivables'),
('CLOSE_FINANCIAL_PERIODS', 'Finance', 'Create and finalize controlled financial periods'),
('VIEW_INVENTORY', 'Inventory', 'View stock, movements, suppliers, and alerts'),
('MANAGE_INVENTORY', 'Inventory', 'Create items and adjust inventory balances'),
('CONSUME_INVENTORY', 'Inventory', 'Record clinical consumption of inventory'),
('MANAGE_PURCHASE_ORDERS', 'Inventory', 'Create, approve, receive, and close purchase orders'),
('MANAGE_SUPPLIERS', 'Inventory', 'Create and maintain supplier records'),
('VIEW_EQUIPMENT', 'Equipment', 'View equipment, service, maintenance, and downtime records'),
('MANAGE_EQUIPMENT', 'Equipment', 'Create and maintain equipment registry records'),
('MANAGE_MAINTENANCE', 'Equipment', 'Schedule and update equipment maintenance'),
('MANAGE_DOWNTIME', 'Equipment', 'Record and update equipment downtime'),
('MANAGE_SHIFTS', 'HR', 'Create and maintain staff shift schedules'),
('MANAGE_LEAVE', 'HR', 'Review and decide staff leave requests'),
('VIEW_MARKETING', 'Marketing', 'View CRM activity, campaigns, segments, and feedback'),
('VIEW_ANALYTICS', 'Analytics', 'View operational and financial analytics'),
('EXPORT_ANALYTICS', 'Analytics', 'Export operational and financial analytics'),
('VIEW_REFERRING_DOCTORS', 'Referrals', 'View referring-doctor directory and performance'),
('MANAGE_REFERRING_DOCTORS', 'Referrals', 'Create and maintain referring-doctor records'),
('MANAGE_USERS', 'System', 'Create and maintain system user accounts'),
('MANAGE_SETTINGS', 'System', 'Update facility and system settings'),
('MANAGE_INTEGRATIONS', 'System', 'Configure and operate external integrations'),
('MANAGE_BACKUPS', 'System', 'Create, restore, and manage system backups'),
('MANAGE_NOTIFICATIONS', 'System', 'Configure notification templates and preferences'),
('VIEW_SECURITY_EVENTS', 'System', 'View security events and access anomalies'),
('VIEW_PRIVACY_REQUESTS', 'Privacy', 'View patient privacy and data requests'),
('MANAGE_PRIVACY_REQUESTS', 'Privacy', 'Resolve patient privacy and data requests')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

-- Administrator is immutable full access.
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id FROM permissions
ON CONFLICT DO NOTHING;

-- Additive defaults for existing operational roles. Existing custom grants are never removed.
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Receptionist'::user_role, permission_id FROM permissions
WHERE name IN (
    'MANAGE_WAITLIST', 'PROCESS_PAYMENTS', 'VIEW_INSURANCE', 'MANAGE_INSURANCE_APPROVALS',
    'VIEW_REFERRING_DOCTORS', 'MANAGE_REFERRING_DOCTORS', 'VIEW_MARKETING', 'MANAGE_CRM'
) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Radiologist'::user_role, permission_id FROM permissions
WHERE name IN ('MANAGE_SAFETY', 'REVIEW_REPORTS', 'DELIVER_RESULTS', 'VIEW_ANALYTICS')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Technician'::user_role, permission_id FROM permissions
WHERE name IN ('MANAGE_SAFETY', 'VIEW_EQUIPMENT', 'MANAGE_MAINTENANCE', 'MANAGE_DOWNTIME', 'VIEW_INVENTORY', 'CONSUME_INVENTORY')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Nurse'::user_role, permission_id FROM permissions
WHERE name IN ('VIEW_PATIENTS', 'EDIT_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS', 'MANAGE_SAFETY', 'DELIVER_RESULTS', 'VIEW_INVENTORY', 'CONSUME_INVENTORY')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Accountant'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_INVOICES', 'CREATE_INVOICES', 'EDIT_INVOICES', 'PROCESS_PAYMENTS', 'ISSUE_REFUNDS',
    'VIEW_INSURANCE', 'MANAGE_INSURANCE_PROVIDERS', 'MANAGE_INSURANCE_CONTRACTS',
    'MANAGE_INSURANCE_APPROVALS', 'MANAGE_INSURANCE_CLAIMS', 'VIEW_FINANCIALS',
    'MANAGE_EXPENSES', 'MANAGE_COMMISSIONS', 'MANAGE_RECEIVABLES',
    'VIEW_ANALYTICS', 'EXPORT_ANALYTICS', 'VIEW_REFERRING_DOCTORS', 'VIEW_INVENTORY',
    'MANAGE_PURCHASE_ORDERS', 'MANAGE_SUPPLIERS'
) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Insurance_Staff'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_INVOICES', 'VIEW_INSURANCE',
    'MANAGE_INSURANCE_PROVIDERS', 'MANAGE_INSURANCE_CONTRACTS',
    'MANAGE_INSURANCE_APPROVALS', 'MANAGE_INSURANCE_CLAIMS',
    'MANAGE_RECEIVABLES', 'VIEW_ANALYTICS'
) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'HR'::user_role, permission_id FROM permissions
WHERE name IN ('VIEW_STAFF', 'MANAGE_STAFF', 'MANAGE_SHIFTS', 'MANAGE_LEAVE', 'VIEW_ANALYTICS')
ON CONFLICT DO NOTHING;
