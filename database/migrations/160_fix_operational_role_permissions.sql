-- Fix operational role permission gaps.
--
-- Frontend route guards (src/config/routes.js) advertise pages to clinical
-- roles, but the RBAC grants never covered them consistently: e.g. the
-- /modality page requires VIEW_EXAMS / PERFORM_EXAMS, which were only held
-- by Admin/Developer, so Technician demo/staff logins got 403s from every
-- API the page calls.
--
-- Grants here are additive (ON CONFLICT DO NOTHING) and mirror the workspace
-- each role actually uses:

-- Technician: the modality technologist workspace (exams, queue, PACS, safety)
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Technician'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_PATIENTS', 'VIEW_APPOINTMENTS',
    'VIEW_EXAMS', 'PERFORM_EXAMS', 'MANAGE_QUEUE', 'MANAGE_SAFETY',
    'VIEW_PACS_IMAGES', 'DOWNLOAD_PACS_DICOM', 'RECONCILE_STUDIES',
    'VIEW_EQUIPMENT', 'MANAGE_MAINTENANCE', 'MANAGE_DOWNTIME',
    'VIEW_INVENTORY', 'CONSUME_INVENTORY'
) ON CONFLICT DO NOTHING;

-- Radiologist: diagnostic worklist, reporting, PACS
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Radiologist'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_PATIENTS', 'VIEW_APPOINTMENTS',
    'VIEW_EXAMS', 'MANAGE_QUEUE', 'MANAGE_SAFETY',
    'VIEW_REPORTS', 'WRITE_REPORTS', 'REVIEW_REPORTS', 'FINALIZE_REPORTS', 'AMEND_REPORTS',
    'DELIVER_RESULTS', 'IMPROVE_REPORT_FORMAT',
    'VIEW_PACS_IMAGES', 'DOWNLOAD_PACS_DICOM', 'RECONCILE_STUDIES',
    'ASSIGN_CLINICAL_TASKS', 'VIEW_ANALYTICS'
) ON CONFLICT DO NOTHING;

-- Nurse: preparation and recovery workflow
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Nurse'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_PATIENTS', 'EDIT_PATIENTS', 'VIEW_APPOINTMENTS',
    'VIEW_EXAMS', 'MANAGE_QUEUE', 'MANAGE_SAFETY', 'DELIVER_RESULTS',
    'VIEW_PACS_IMAGES',
    'VIEW_INVENTORY', 'CONSUME_INVENTORY'
) ON CONFLICT DO NOTHING;

-- Receptionist: front-desk scheduling and intake
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Receptionist'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_PATIENTS', 'CREATE_PATIENTS', 'EDIT_PATIENTS',
    'VIEW_APPOINTMENTS', 'CREATE_APPOINTMENTS', 'EDIT_APPOINTMENTS', 'DELETE_APPOINTMENTS',
    'MANAGE_WAITLIST',
    'VIEW_EXAMS', 'MANAGE_QUEUE',
    'VIEW_INVOICES', 'CREATE_INVOICES', 'PROCESS_PAYMENTS',
    'VIEW_INSURANCE', 'MANAGE_INSURANCE_APPROVALS',
    'VIEW_REFERRING_DOCTORS', 'MANAGE_REFERRING_DOCTORS',
    'MANAGE_CHAT'
) ON CONFLICT DO NOTHING;

-- Cashier: payments desk
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Cashier'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_PATIENTS',
    'VIEW_APPOINTMENTS', 'VIEW_EXAMS',
    'VIEW_INVOICES', 'CREATE_INVOICES', 'EDIT_INVOICES', 'PROCESS_PAYMENTS',
    'OPEN_CASHIER_SHIFT', 'CLOSE_CASHIER_SHIFT',
    'REQUEST_REFUNDS', 'APPLY_DISCOUNTS',
    'VIEW_INSURANCE'
) ON CONFLICT DO NOTHING;

-- Accountant: revenue cycle and finance reporting
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
    'RECONCILE_SHIFTS', 'APPROVE_SHIFT_VARIANCE'
) ON CONFLICT DO NOTHING;

-- Insurance staff: payer operations desk
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Insurance_Staff'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS', 'VIEW_INVOICES',
    'VIEW_INSURANCE', 'MANAGE_INSURANCE_PROVIDERS', 'MANAGE_INSURANCE_CONTRACTS',
    'MANAGE_INSURANCE_APPROVALS', 'MANAGE_INSURANCE_CLAIMS',
    'SUBMIT_INSURANCE_CLAIMS', 'RECONCILE_INSURANCE_CLAIMS',
    'MANAGE_RECEIVABLES', 'VIEW_ANALYTICS'
) ON CONFLICT DO NOTHING;

-- HR: people operations
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'HR'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_STAFF', 'MANAGE_STAFF', 'MANAGE_SHIFTS', 'MANAGE_LEAVE', 'MANAGE_ATTENDANCE',
    'VIEW_USERS',
    'VIEW_PAYROLL', 'REVIEW_PAYROLL', 'APPROVE_PAYROLL',
    'MANAGE_EMPLOYEE_COMPENSATION', 'MANAGE_DEDUCTIONS', 'MANAGE_PENALTIES', 'EXPORT_PAYROLL',
    'VIEW_ANALYTICS', 'MANAGE_CHAT'
) ON CONFLICT DO NOTHING;

-- Marketing: campaigns and referrals outreach
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Marketing'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_PATIENTS',
    'VIEW_MARKETING', 'MANAGE_MARKETING', 'VIEW_CRM', 'MANAGE_CRM',
    'VIEW_REFERRING_DOCTORS', 'MANAGE_REFERRING_DOCTORS', 'VIEW_REFERRAL_ANALYTICS',
    'VIEW_ANALYTICS', 'MANAGE_CHAT'
) ON CONFLICT DO NOTHING;

-- Referring doctor: read-only clinical summary of their own referrals
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Referring_Doctor'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_PATIENTS', 'VIEW_APPOINTMENTS', 'VIEW_EXAMS', 'VIEW_REPORTS'
) ON CONFLICT DO NOTHING;
