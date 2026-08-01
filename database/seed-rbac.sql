-- Seed file for Role-Based Access Control (Phase 19)

-- 1. Insert Base Permissions
INSERT INTO permissions (name, module, description) VALUES
-- Patient Management
('VIEW_PATIENTS', 'Patients', 'View patient list and basic details'),
('CREATE_PATIENTS', 'Patients', 'Register new patients'),
('EDIT_PATIENTS', 'Patients', 'Modify patient details'),
('DELETE_PATIENTS', 'Patients', 'Delete or archive patients'),
('MERGE_PATIENTS', 'Patients', 'Merge duplicate patient records'),

-- Appointments & Scheduling
('VIEW_APPOINTMENTS', 'Scheduling', 'View appointments calendar and list'),
('CREATE_APPOINTMENTS', 'Scheduling', 'Create new appointments'),
('EDIT_APPOINTMENTS', 'Scheduling', 'Reschedule or modify appointments'),
('DELETE_APPOINTMENTS', 'Scheduling', 'Cancel or delete appointments'),

-- Exams & Reports
('VIEW_EXAMS', 'Clinical', 'View exam worklist and details'),
('MANAGE_QUEUE', 'Clinical Operations', 'Change exam queue stages and operational routing'),
('PERFORM_EXAMS', 'Clinical', 'Start and complete radiological exams'),
('WRITE_REPORTS', 'Clinical', 'Draft and edit diagnostic reports'),
('FINALIZE_REPORTS', 'Clinical', 'Approve and finalize diagnostic reports'),
('AMEND_REPORTS', 'Clinical', 'Amend finalized reports'),
('VIEW_REPORTS', 'Clinical', 'View case reports worklist, print, and export'),
('IMPROVE_REPORT_FORMAT', 'Clinical', 'Use AI to reformat and polish report text'),

-- Billing & Invoicing
('VIEW_INVOICES', 'Billing', 'View financial invoices and payments'),
('CREATE_INVOICES', 'Billing', 'Generate new invoices'),
('EDIT_INVOICES', 'Billing', 'Modify invoices and apply refunds'),

-- HR & CRM
('VIEW_STAFF', 'HR', 'View employee profiles and attendance'),
('MANAGE_STAFF', 'HR', 'Manage employee profiles, shifts, and leave'),
('MANAGE_CRM', 'Marketing', 'Manage CRM campaigns, segments, and feedback'),

-- System Administration
('MANAGE_ROLES', 'System', 'Modify role permissions'),
('VIEW_AUDIT_LOGS', 'System', 'View system audit trails'),
('VIEW_AUDIT_TRAILS', 'System', 'View system logs, structured audit events, and audit alerts'),
('EXPORT_AUDIT_TRAILS', 'System', 'Export system audit trails and event logs'),
('VERIFY_AUDIT_CHAIN', 'System', 'Verify tamper-evident audit hash chains'),
('RUN_AUDIT_DETECTIONS', 'System', 'Run audit detection rules and create audit alerts'),
('REVIEW_AUDIT_ALERTS', 'System', 'Resolve or dismiss audit detection alerts'),
('MANAGE_DEVELOPER_ROLE', 'System', 'Create, assign, and govern Developer accounts'),
('MANAGE_PROTECTED_ROLES', 'System', 'Manage Developer and Admin role permissions and assignments'),
('MANAGE_DATABASE_CONFIG', 'System', 'View, test, and update database connection configuration'),
('VIEW_SYSTEM_DIAGNOSTICS', 'System', 'View runtime, database, and service health diagnostics'),
('MANAGE_SYSTEM_RUNTIME', 'System', 'Operate runtime cache, background jobs, and maintenance controls'),
('MANAGE_FEATURE_FLAGS', 'System', 'Create and update system feature flags'),
('VIEW_MIGRATION_STATUS', 'System', 'View database migration status and history'),
('MANAGE_SECRET_SETTINGS', 'System', 'Create and rotate secret-bearing provider settings'),
('RESTORE_BACKUPS', 'System', 'Restore backups into the active system'),
('DOWNLOAD_BACKUPS', 'System', 'Download generated backup artifacts'),

-- Privacy governance
('VIEW_PRIVACY_REQUESTS', 'Privacy', 'View patient privacy and data-subject requests'),
('CREATE_PRIVACY_REQUESTS', 'Privacy', 'Create privacy requests for patients'),
('RESOLVE_PRIVACY_REQUESTS', 'Privacy', 'Review, reject, and complete privacy requests'),
('EXPORT_PATIENT_DATA', 'Privacy', 'Generate and download patient data export artifacts'),
('ANONYMIZE_PATIENT_DATA', 'Privacy', 'Perform irreversible patient anonymization workflows'),
('MANAGE_CONSENTS', 'Privacy', 'Record and revoke patient consent history')
ON CONFLICT (name) DO NOTHING;

-- 2. Assign Permissions to Roles
-- We map these dynamically, but here is a default seed for Admin to have everything.
DO $$
DECLARE
    admin_role user_role := 'Admin';
    developer_role user_role := 'Developer';
    recp_role user_role := 'Receptionist';
    rad_role user_role := 'Radiologist';
    tech_role user_role := 'Technician';
    nurse_role user_role := 'Nurse';
BEGIN
    -- Developer gets all current permissions.
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT developer_role, permission_id FROM permissions
    ON CONFLICT DO NOTHING;

    -- Admin gets broad operational permissions, excluding Developer-only controls.
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT admin_role, permission_id FROM permissions
    WHERE name NOT IN (
        'MANAGE_DEVELOPER_ROLE',
        'MANAGE_PROTECTED_ROLES',
        'MANAGE_DATABASE_CONFIG',
        'VIEW_SYSTEM_DIAGNOSTICS',
        'MANAGE_SYSTEM_RUNTIME',
        'MANAGE_FEATURE_FLAGS',
        'VIEW_MIGRATION_STATUS',
        'MANAGE_SECRET_SETTINGS',
        'RESTORE_BACKUPS'
    )
    ON CONFLICT DO NOTHING;

    -- Receptionist gets patient, scheduling, billing, and cashier operations.
    -- Approval/reconciliation permissions remain separated.
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT recp_role, permission_id FROM permissions
    WHERE name IN ('VIEW_PATIENTS', 'CREATE_PATIENTS', 'EDIT_PATIENTS', 'VIEW_APPOINTMENTS', 'CREATE_APPOINTMENTS', 'EDIT_APPOINTMENTS', 'VIEW_INVOICES', 'CREATE_INVOICES', 'PROCESS_PAYMENTS', 'OPEN_CASHIER_SHIFT', 'CLOSE_CASHIER_SHIFT', 'REQUEST_REFUNDS', 'PROCESS_REFUNDS', 'VIEW_REPORTS', 'MANAGE_QUEUE', 'CREATE_PRIVACY_REQUESTS', 'MANAGE_CONSENTS')
    ON CONFLICT DO NOTHING;

    -- Radiologist gets clinical reporting
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT rad_role, permission_id FROM permissions
    WHERE name IN ('VIEW_PATIENTS', 'VIEW_EXAMS', 'WRITE_REPORTS', 'FINALIZE_REPORTS', 'AMEND_REPORTS', 'VIEW_REPORTS', 'IMPROVE_REPORT_FORMAT', 'MANAGE_QUEUE')
    ON CONFLICT DO NOTHING;

    -- Technician gets exam performance
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT tech_role, permission_id FROM permissions
    WHERE name IN ('VIEW_PATIENTS', 'VIEW_EXAMS', 'PERFORM_EXAMS', 'VIEW_REPORTS', 'MANAGE_QUEUE')
    ON CONFLICT DO NOTHING;

    -- Nurse gets patient care and report viewing/delivery
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT nurse_role, permission_id FROM permissions
    WHERE name IN ('VIEW_PATIENTS', 'VIEW_EXAMS', 'VIEW_REPORTS', 'MANAGE_QUEUE')
    ON CONFLICT DO NOTHING;
END $$;
