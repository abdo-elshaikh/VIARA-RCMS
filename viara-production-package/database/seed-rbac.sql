-- Comprehensive Seed file for Role-Based Access Control (RBAC)
-- Covers all 18 modules and 13 system roles.

-- 1. Insert Base Permissions
INSERT INTO permissions (name, module, description) VALUES
-- Patients
('VIEW_PATIENTS', 'Patients', 'View patient list and basic details'),
('CREATE_PATIENTS', 'Patients', 'Register new patients'),
('EDIT_PATIENTS', 'Patients', 'Modify patient details'),
('DELETE_PATIENTS', 'Patients', 'Delete or archive patients'),
('MERGE_PATIENTS', 'Patients', 'Merge duplicate patient records'),
('EXPORT_PATIENT_DATA', 'Patients', 'Export patient records and history'),
('ANONYMIZE_PATIENT_DATA', 'Patients', 'Perform irreversible patient anonymization'),

-- Scheduling
('VIEW_APPOINTMENTS', 'Scheduling', 'View appointments calendar and list'),
('CREATE_APPOINTMENTS', 'Scheduling', 'Create new appointments'),
('EDIT_APPOINTMENTS', 'Scheduling', 'Reschedule or modify appointments'),
('DELETE_APPOINTMENTS', 'Scheduling', 'Cancel or delete appointments'),
('MANAGE_WAITLIST', 'Scheduling', 'Manage waitlist and scheduling offers'),

-- Clinical
('VIEW_EXAMS', 'Clinical', 'View exam worklist and details'),
('PERFORM_EXAMS', 'Clinical', 'Start and complete radiological exams'),
('WRITE_REPORTS', 'Clinical', 'Draft and edit diagnostic reports'),
('REVIEW_REPORTS', 'Clinical', 'Review diagnostic reports before approval'),
('FINALIZE_REPORTS', 'Clinical', 'Approve and finalize diagnostic reports'),
('AMEND_REPORTS', 'Clinical', 'Amend finalized reports'),
('VIEW_REPORTS', 'Clinical', 'View case reports worklist, print, and export'),
('DELIVER_RESULTS', 'Clinical', 'Release and deliver diagnostic results to patients'),
('IMPROVE_REPORT_FORMAT', 'Clinical', 'Use AI to reformat and polish report text'),

-- Clinical Operations & Safety
('MANAGE_QUEUE', 'Clinical Operations', 'Change exam queue stages and operational routing'),
('ASSIGN_CLINICAL_TASKS', 'Clinical Operations', 'Assign or transfer role-specific clinical tasks'),
('MANAGE_SAFETY', 'Clinical Operations', 'Record and review examination safety screening'),
('OVERRIDE_SAFETY_CHECKLIST', 'Clinical Operations', 'Override clinical safety warnings with justification'),
('REVIEW_END_OF_DAY', 'Clinical Operations', 'Perform end-of-day pending case review and resolution'),
('MANAGE_DISPLAY_BOARD', 'Reception', 'Manage waiting-room display board content and announcements'),

-- Billing & Invoicing
('VIEW_INVOICES', 'Billing', 'View financial invoices and payments'),
('CREATE_INVOICES', 'Billing', 'Generate new invoices'),
('EDIT_INVOICES', 'Billing', 'Modify invoices and apply adjustments'),
('DELETE_INVOICES', 'Billing', 'Cancel or delete invoices'),
('PROCESS_PAYMENTS', 'Billing', 'Collect and reconcile payments'),
('OPEN_CASHIER_SHIFT', 'Billing', 'Open cashier shift'),
('CLOSE_CASHIER_SHIFT', 'Billing', 'Close cashier shift'),
('RECONCILE_SHIFTS', 'Billing', 'Audit and reconcile cashier drawer shifts'),
('APPROVE_SHIFT_VARIANCE', 'Billing', 'Approve cashier drawer variances'),
('REQUEST_REFUNDS', 'Billing', 'Request invoice refunds'),
('PROCESS_REFUNDS', 'Billing', 'Process invoice refunds'),
('APPROVE_REFUNDS', 'Billing', 'Approve invoice refund requests'),
('APPLY_DISCOUNTS', 'Billing', 'Apply promotional or discretionary discounts'),
('OVERRIDE_PRICING', 'Billing', 'Override catalog examination pricing'),
('VOID_INVOICES', 'Billing', 'Void issued invoices'),
('DELIVER_FINAL_REPORT_INVOICE', 'Billing', 'Deliver final report conditioned on full payment'),
('APPLY_PARTIAL_PAYMENT_EXCEPTION', 'Billing', 'Apply exception for partial payment release'),

-- Insurance
('VIEW_INSURANCE', 'Insurance', 'View insurance providers and policies'),
('MANAGE_INSURANCE_PROVIDERS', 'Insurance', 'Create and maintain insurance providers'),
('MANAGE_INSURANCE_CONTRACTS', 'Insurance', 'Manage insurance contracts and fee schedules'),
('MANAGE_INSURANCE_APPROVALS', 'Insurance', 'Manage insurance preauthorizations'),
('MANAGE_INSURANCE_CLAIMS', 'Insurance', 'Prepare and batch insurance claims'),
('SUBMIT_INSURANCE_CLAIMS', 'Insurance', 'Submit insurance reimbursement claims'),
('RECONCILE_INSURANCE_CLAIMS', 'Insurance', 'Reconcile payer remittances and claims'),

-- Finance
('VIEW_FINANCIALS', 'Finance', 'View financial performance and accounting reports'),
('MANAGE_EXPENSES', 'Finance', 'Create and maintain operational expenses'),
('MANAGE_COMMISSIONS', 'Finance', 'Review and settle physician commissions'),
('PAY_COMMISSIONS', 'Finance', 'Execute physician commission payouts'),
('MANAGE_RECEIVABLES', 'Finance', 'Review and manage outstanding receivables'),
('CLOSE_FINANCIAL_PERIODS', 'Finance', 'Create and finalize controlled financial periods'),
('POST_PAYROLL_TO_FINANCE', 'Finance', 'Post approved payroll batches to general ledger'),

-- Inventory
('VIEW_INVENTORY', 'Inventory', 'View stock, movements, suppliers, and alerts'),
('MANAGE_INVENTORY', 'Inventory', 'Create items and adjust inventory balances'),
('CONSUME_INVENTORY', 'Inventory', 'Record clinical consumption of inventory'),
('MANAGE_PURCHASE_ORDERS', 'Inventory', 'Create, approve, receive, and close purchase orders'),
('MANAGE_SUPPLIERS', 'Inventory', 'Create and maintain supplier records'),

-- Equipment
('VIEW_EQUIPMENT', 'Equipment', 'View equipment, service, maintenance, and downtime records'),
('MANAGE_EQUIPMENT', 'Equipment', 'Create and maintain equipment registry records'),
('MANAGE_MAINTENANCE', 'Equipment', 'Schedule and update equipment maintenance'),
('MANAGE_DOWNTIME', 'Equipment', 'Record and update equipment downtime'),
('VIEW_ROOMS', 'Equipment', 'View clinical rooms and room assignments'),
('MANAGE_ROOMS', 'Equipment', 'Create, update, and manage clinical rooms and maintenance states'),

-- PACS
('VIEW_PACS_IMAGES', 'PACS', 'View DICOM studies in the diagnostic image viewer'),
('MANAGE_PACS', 'PACS', 'Configure PACS/modality settings and operate imaging archive'),
('RECONCILE_STUDIES', 'PACS', 'Reconcile quarantined DICOM studies to scheduled examinations'),
('DOWNLOAD_PACS_DICOM', 'PACS', 'Download raw DICOM image series'),
('UPLOAD_PACS_STUDIES', 'PACS', 'Upload and import external DICOM studies'),

-- HR
('VIEW_STAFF', 'HR', 'View employee profiles and attendance'),
('MANAGE_STAFF', 'HR', 'Manage employee profiles and records'),
('MANAGE_SHIFTS', 'HR', 'Create and maintain staff shift schedules'),
('MANAGE_LEAVE', 'HR', 'Review and decide staff leave requests'),
('MANAGE_ATTENDANCE', 'HR', 'Correct and audit employee attendance logs'),

-- Payroll
('VIEW_PAYROLL', 'Payroll', 'View payroll periods, calculations, deductions, and penalties'),
('MANAGE_PAYROLL_PERIODS', 'Payroll', 'Create and maintain payroll periods'),
('CALCULATE_PAYROLL', 'Payroll', 'Calculate and recalculate payroll runs'),
('REVIEW_PAYROLL', 'Payroll', 'Review payroll runs before approval'),
('APPROVE_PAYROLL', 'Payroll', 'Approve payroll runs for payment'),
('PAY_PAYROLL', 'Payroll', 'Record payroll payment execution'),
('LOCK_PAYROLL', 'Payroll', 'Lock paid payroll runs against further changes'),
('MANAGE_PAYROLL_RULES', 'Payroll', 'Configure payroll rules and calculation inputs'),
('MANAGE_EMPLOYEE_COMPENSATION', 'Payroll', 'Manage employee compensation profiles'),
('MANAGE_DEDUCTIONS', 'Payroll', 'Manage employee deductions and advances'),
('MANAGE_PENALTIES', 'Payroll', 'Manage employee payroll penalties'),
('EXPORT_PAYROLL', 'Payroll', 'Export payroll reports and payment files'),
('VIEW_PAYROLL_JOURNALS', 'Payroll', 'View payroll journal posting references and payment audit context'),

-- Marketing & Referrals
('VIEW_MARKETING', 'Marketing', 'View CRM activity, campaigns, segments, and feedback'),
('MANAGE_MARKETING', 'Marketing', 'Create and launch marketing campaigns'),
('VIEW_CRM', 'Marketing', 'View customer relationship history and surveys'),
('MANAGE_CRM', 'Marketing', 'Manage CRM campaigns, segments, and feedback'),
('VIEW_REFERRING_DOCTORS', 'Referrals', 'View referring-doctor directory and performance'),
('MANAGE_REFERRING_DOCTORS', 'Referrals', 'Create and maintain referring-doctor records'),
('VIEW_REFERRAL_ANALYTICS', 'Referrals', 'View referring doctor revenue analytics'),

-- Communications
('MANAGE_CHAT', 'Communications', 'Allows staff members to use direct chat, channels, and reply to portals'),
('VIEW_PORTAL_MESSAGES', 'Communications', 'View patient and referring-doctor portal conversations'),

-- Analytics
('VIEW_ANALYTICS', 'Analytics', 'View operational and financial analytics'),
('EXPORT_ANALYTICS', 'Analytics', 'Export operational and financial analytics'),

-- Privacy
('VIEW_PRIVACY_REQUESTS', 'Privacy', 'View patient privacy and data-subject requests'),
('CREATE_PRIVACY_REQUESTS', 'Privacy', 'Create privacy requests for patients'),
('MANAGE_PRIVACY_REQUESTS', 'Privacy', 'Review and manage privacy requests'),
('RESOLVE_PRIVACY_REQUESTS', 'Privacy', 'Resolve, reject, and complete privacy requests'),
('MANAGE_CONSENTS', 'Privacy', 'Record and revoke patient consent history'),

-- System Administration & Security
('VIEW_USERS', 'System', 'View system user accounts'),
('MANAGE_USERS', 'System', 'Create and maintain system user accounts'),
('MANAGE_ROLES', 'System', 'Modify role permissions'),
('VIEW_AUDIT_LOGS', 'System', 'View limited staff activity and operational events'),
('EXPORT_STAFF_ACTIVITY', 'System', 'Export limited staff activity and operational events'),
('VIEW_AUDIT_TRAILS', 'System', 'View the detailed security audit trail and audit alerts'),
('EXPORT_AUDIT_TRAILS', 'System', 'Export system audit trails and event logs'),
('VERIFY_AUDIT_CHAIN', 'System', 'Verify tamper-evident audit hash chains'),
('RUN_AUDIT_DETECTIONS', 'System', 'Run audit detection rules and create audit alerts'),
('REVIEW_AUDIT_ALERTS', 'System', 'Resolve or dismiss audit detection alerts'),
('VIEW_SECURITY_EVENTS', 'System', 'View security events and access anomalies'),
('MANAGE_SETTINGS', 'System', 'Update facility and system settings'),
('MANAGE_INTEGRATIONS', 'System', 'Configure and operate external integrations'),
('MANAGE_BACKUPS', 'System', 'Create and manage system backups'),
('DOWNLOAD_BACKUPS', 'System', 'Download generated backup artifacts'),
('MANAGE_NOTIFICATIONS', 'System', 'Configure notification templates and preferences'),

-- Developer Platform (Developer Only)
('MANAGE_DEVELOPER_ROLE', 'Developer', 'Create, assign, and govern Developer accounts'),
('MANAGE_PROTECTED_ROLES', 'Developer', 'Manage Developer and Admin role permissions and assignments'),
('MANAGE_DATABASE_CONFIG', 'Developer', 'View, test, and update database connection configuration'),
('VIEW_SYSTEM_DIAGNOSTICS', 'Developer', 'View runtime, database, and service health diagnostics'),
('MANAGE_SYSTEM_RUNTIME', 'Developer', 'Operate runtime cache, background jobs, and maintenance controls'),
('MANAGE_FEATURE_FLAGS', 'Developer', 'Create and update system feature flags'),
('VIEW_MIGRATION_STATUS', 'Developer', 'View database migration status and history'),
('MANAGE_SECRET_SETTINGS', 'Developer', 'Create and rotate secret-bearing provider settings'),
('RESTORE_BACKUPS', 'Developer', 'Restore backups into the active system')

ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

-- 2. Assign Default Permissions to Roles
DO $$
DECLARE
    dev_role user_role := 'Developer';
    admin_role user_role := 'Admin';
BEGIN
    -- Developer gets all current permissions.
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT dev_role, permission_id FROM permissions
    ON CONFLICT DO NOTHING;

    -- Admin gets all permissions except Developer platform controls.
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
    -- Technician
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT 'Technician'::user_role, permission_id FROM permissions
    WHERE name IN (
        'VIEW_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS', 'PERFORM_EXAMS', 'MANAGE_QUEUE', 'MANAGE_SAFETY',
        'VIEW_PACS_IMAGES', 'DOWNLOAD_PACS_DICOM', 'RECONCILE_STUDIES',
        'VIEW_EQUIPMENT', 'MANAGE_MAINTENANCE', 'MANAGE_DOWNTIME',
        'VIEW_INVENTORY', 'CONSUME_INVENTORY', 'VIEW_REPORTS', 'VIEW_ROOMS', 'MANAGE_CHAT'
    ) ON CONFLICT DO NOTHING;

    -- Radiologist
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT 'Radiologist'::user_role, permission_id FROM permissions
    WHERE name IN (
        'VIEW_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS', 'MANAGE_QUEUE', 'MANAGE_SAFETY', 'OVERRIDE_SAFETY_CHECKLIST',
        'VIEW_REPORTS', 'WRITE_REPORTS', 'REVIEW_REPORTS', 'FINALIZE_REPORTS', 'AMEND_REPORTS',
        'DELIVER_RESULTS', 'IMPROVE_REPORT_FORMAT',
        'VIEW_PACS_IMAGES', 'DOWNLOAD_PACS_DICOM', 'RECONCILE_STUDIES',
        'ASSIGN_CLINICAL_TASKS', 'VIEW_ANALYTICS', 'MANAGE_CHAT'
    ) ON CONFLICT DO NOTHING;

    -- Nurse
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT 'Nurse'::user_role, permission_id FROM permissions
    WHERE name IN (
        'VIEW_PATIENTS', 'EDIT_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS', 'MANAGE_QUEUE', 'MANAGE_SAFETY',
        'VIEW_REPORTS', 'DELIVER_RESULTS', 'VIEW_PACS_IMAGES',
        'VIEW_INVENTORY', 'CONSUME_INVENTORY', 'VIEW_ROOMS', 'MANAGE_CHAT'
    ) ON CONFLICT DO NOTHING;

    -- Receptionist
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT 'Receptionist'::user_role, permission_id FROM permissions
    WHERE name IN (
        'VIEW_PATIENTS', 'CREATE_PATIENTS', 'EDIT_PATIENTS',
        'VIEW_APPOINTMENTS', 'CREATE_APPOINTMENTS', 'EDIT_APPOINTMENTS', 'DELETE_APPOINTMENTS',
        'MANAGE_WAITLIST', 'VIEW_EXAMS', 'MANAGE_QUEUE', 'REVIEW_END_OF_DAY',
        'VIEW_INVOICES', 'CREATE_INVOICES', 'PROCESS_PAYMENTS',
        'VIEW_INSURANCE', 'MANAGE_INSURANCE_APPROVALS',
        'VIEW_REFERRING_DOCTORS', 'MANAGE_REFERRING_DOCTORS',
        'MANAGE_DISPLAY_BOARD', 'VIEW_REPORTS', 'DELIVER_RESULTS', 'VIEW_ROOMS', 'MANAGE_CHAT', 'VIEW_MARKETING', 'VIEW_PORTAL_MESSAGES'
    ) ON CONFLICT DO NOTHING;

    -- Cashier
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT 'Cashier'::user_role, permission_id FROM permissions
    WHERE name IN (
        'VIEW_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS',
        'VIEW_INVOICES', 'CREATE_INVOICES', 'EDIT_INVOICES', 'PROCESS_PAYMENTS',
        'OPEN_CASHIER_SHIFT', 'CLOSE_CASHIER_SHIFT',
        'REQUEST_REFUNDS', 'APPLY_DISCOUNTS', 'VIEW_INSURANCE'
    ) ON CONFLICT DO NOTHING;

    -- Accountant
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT 'Accountant'::user_role, permission_id FROM permissions
    WHERE name IN (
        'VIEW_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS',
        'VIEW_INVOICES', 'CREATE_INVOICES', 'EDIT_INVOICES', 'VOID_INVOICES',
        'PROCESS_PAYMENTS', 'APPROVE_REFUNDS', 'APPLY_PARTIAL_PAYMENT_EXCEPTION',
        'VIEW_INSURANCE', 'MANAGE_INSURANCE_PROVIDERS', 'MANAGE_INSURANCE_CONTRACTS',
        'MANAGE_INSURANCE_APPROVALS', 'MANAGE_INSURANCE_CLAIMS',
        'SUBMIT_INSURANCE_CLAIMS', 'RECONCILE_INSURANCE_CLAIMS',
        'VIEW_FINANCIALS', 'MANAGE_EXPENSES', 'MANAGE_COMMISSIONS', 'MANAGE_RECEIVABLES',
        'VIEW_ANALYTICS', 'EXPORT_ANALYTICS', 'VIEW_REFERRING_DOCTORS',
        'VIEW_INVENTORY', 'MANAGE_PURCHASE_ORDERS', 'MANAGE_SUPPLIERS',
        'RECONCILE_SHIFTS', 'APPROVE_SHIFT_VARIANCE',
        'VIEW_AUDIT_TRAILS', 'VIEW_PAYROLL', 'POST_PAYROLL_TO_FINANCE', 'VIEW_PAYROLL_JOURNALS'
    ) ON CONFLICT DO NOTHING;

    -- Insurance Staff
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT 'Insurance_Staff'::user_role, permission_id FROM permissions
    WHERE name IN (
        'VIEW_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS', 'VIEW_INVOICES',
        'VIEW_INSURANCE', 'MANAGE_INSURANCE_PROVIDERS', 'MANAGE_INSURANCE_CONTRACTS',
        'MANAGE_INSURANCE_APPROVALS', 'MANAGE_INSURANCE_CLAIMS',
        'SUBMIT_INSURANCE_CLAIMS', 'RECONCILE_INSURANCE_CLAIMS',
        'MANAGE_RECEIVABLES', 'VIEW_ANALYTICS'
    ) ON CONFLICT DO NOTHING;

    -- HR
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT 'HR'::user_role, permission_id FROM permissions
    WHERE name IN (
        'VIEW_STAFF', 'MANAGE_STAFF', 'MANAGE_SHIFTS', 'MANAGE_LEAVE', 'MANAGE_ATTENDANCE',
        'VIEW_USERS', 'VIEW_AUDIT_LOGS', 'EXPORT_STAFF_ACTIVITY',
        'VIEW_PAYROLL', 'REVIEW_PAYROLL', 'APPROVE_PAYROLL',
        'MANAGE_EMPLOYEE_COMPENSATION', 'MANAGE_DEDUCTIONS', 'MANAGE_PENALTIES', 'EXPORT_PAYROLL',
        'VIEW_ANALYTICS', 'MANAGE_CHAT'
    ) ON CONFLICT DO NOTHING;

    -- Marketing
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT 'Marketing'::user_role, permission_id FROM permissions
    WHERE name IN (
        'VIEW_PATIENTS', 'VIEW_MARKETING', 'MANAGE_MARKETING', 'VIEW_CRM', 'MANAGE_CRM',
        'VIEW_REFERRING_DOCTORS', 'MANAGE_REFERRING_DOCTORS', 'VIEW_REFERRAL_ANALYTICS',
        'VIEW_ANALYTICS', 'MANAGE_CHAT'
    ) ON CONFLICT DO NOTHING;

    -- Referring Doctor
    INSERT INTO role_permissions (role_name, permission_id)
    SELECT 'Referring_Doctor'::user_role, permission_id FROM permissions
    WHERE name IN (
        'VIEW_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS', 'VIEW_REPORTS'
    ) ON CONFLICT DO NOTHING;
END $$;
