-- Migration 113: Ensure Base Operational & Patient Registration RBAC Permissions
-- Guarantees that Receptionist, Admin, and other clinical roles possess their required core permissions.

-- 1. Insert any missing base permissions
INSERT INTO permissions (name, module, description) VALUES
('VIEW_PATIENTS', 'Patients', 'View patient list and basic details'),
('CREATE_PATIENTS', 'Patients', 'Register new patients'),
('EDIT_PATIENTS', 'Patients', 'Modify patient details'),
('DELETE_PATIENTS', 'Patients', 'Delete or archive patients'),
('MERGE_PATIENTS', 'Patients', 'Merge duplicate patient records'),
('VIEW_APPOINTMENTS', 'Scheduling', 'View appointments calendar and list'),
('CREATE_APPOINTMENTS', 'Scheduling', 'Create new appointments'),
('EDIT_APPOINTMENTS', 'Scheduling', 'Reschedule or modify appointments'),
('DELETE_APPOINTMENTS', 'Scheduling', 'Cancel or delete appointments'),
('MANAGE_WAITLIST', 'Scheduling', 'Manage waitlist and scheduling offers'),
('VIEW_INVOICES', 'Billing', 'View invoices and transactions'),
('CREATE_INVOICES', 'Billing', 'Create new invoices'),
('EDIT_INVOICES', 'Billing', 'Modify invoices'),
('PROCESS_PAYMENTS', 'Billing', 'Collect and reconcile payments'),
('OPEN_CASHIER_SHIFT', 'Billing', 'Open cashier shifts'),
('CLOSE_CASHIER_SHIFT', 'Billing', 'Close cashier shifts'),
('REQUEST_REFUNDS', 'Billing', 'Request invoice refunds'),
('PROCESS_REFUNDS', 'Billing', 'Process invoice refunds'),
('VIEW_INSURANCE', 'Insurance', 'View insurance providers and policies'),
('MANAGE_INSURANCE_APPROVALS', 'Insurance', 'Manage insurance approvals'),
('VIEW_REFERRING_DOCTORS', 'Referrals', 'View referring doctors directory'),
('MANAGE_REFERRING_DOCTORS', 'Referrals', 'Manage referring doctors'),
('VIEW_REPORTS', 'Clinical', 'View case reports'),
('MANAGE_QUEUE', 'Clinical Operations', 'Manage exam queue stages'),
('CREATE_PRIVACY_REQUESTS', 'Privacy', 'Create privacy requests'),
('MANAGE_CONSENTS', 'Privacy', 'Manage patient consents')
ON CONFLICT (name) DO NOTHING;

-- 2. Ensure Receptionist role has patient management, scheduling, cashier, and queue permissions
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Receptionist'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_PATIENTS', 'CREATE_PATIENTS', 'EDIT_PATIENTS',
    'VIEW_APPOINTMENTS', 'CREATE_APPOINTMENTS', 'EDIT_APPOINTMENTS',
    'MANAGE_WAITLIST', 'VIEW_INSURANCE', 'MANAGE_INSURANCE_APPROVALS',
    'VIEW_REFERRING_DOCTORS', 'MANAGE_REFERRING_DOCTORS', 'VIEW_MARKETING',
    'VIEW_INVOICES', 'CREATE_INVOICES', 'PROCESS_PAYMENTS',
    'OPEN_CASHIER_SHIFT', 'CLOSE_CASHIER_SHIFT', 'REQUEST_REFUNDS', 'PROCESS_REFUNDS',
    'CONSUME_INVENTORY', 'VIEW_REPORTS', 'MANAGE_QUEUE',
    'CREATE_PRIVACY_REQUESTS', 'MANAGE_CONSENTS', 'MANAGE_DOWNTIME'
)
ON CONFLICT DO NOTHING;

-- 3. Ensure Admin role has all operational permissions (excluding Developer-only)
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id FROM permissions
WHERE name NOT IN (
    'MANAGE_DEVELOPER_ROLE', 'MANAGE_PROTECTED_ROLES', 'MANAGE_DATABASE_CONFIG',
    'VIEW_SYSTEM_DIAGNOSTICS', 'MANAGE_SYSTEM_RUNTIME', 'MANAGE_FEATURE_FLAGS',
    'VIEW_MIGRATION_STATUS', 'MANAGE_SECRET_SETTINGS', 'RESTORE_BACKUPS'
)
ON CONFLICT DO NOTHING;

-- 4. Ensure Developer role has all permissions
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Developer'::user_role, permission_id FROM permissions
ON CONFLICT DO NOTHING;
