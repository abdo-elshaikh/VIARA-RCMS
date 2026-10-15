-- Migration 185: Reconcile workflow role permissions and eliminate authorization gaps
--
-- 1. Register REVIEW_END_OF_DAY permission for reception/shift closure workflow
-- 2. Grant REVIEW_END_OF_DAY to Receptionist, Admin, and Developer
-- 3. Grant VIEW_AUDIT_LOGS and EXPORT_STAFF_ACTIVITY to HR for staff activity tracking
-- 4. Grant VIEW_PAYROLL and POST_PAYROLL_TO_FINANCE to Accountant for finance payroll reconciliation
-- 5. Guarantee VIEW_REPORTS for Receptionist and Technician
-- 6. Guarantee VIEW_ROOMS for Receptionist, Technician, and Nurse

-- 1. Register REVIEW_END_OF_DAY
INSERT INTO permissions (name, module, description, risk_level)
VALUES (
    'REVIEW_END_OF_DAY',
    'Clinical Operations',
    'Perform end-of-day/end-of-shift pending case review and disposition resolution',
    'sensitive'
)
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description,
    risk_level = EXCLUDED.risk_level;

-- 2. Grant REVIEW_END_OF_DAY to Receptionist, Admin, Developer
INSERT INTO role_permissions (role_name, permission_id)
SELECT r.role_name::user_role, p.permission_id
FROM (VALUES ('Receptionist'), ('Admin'), ('Developer')) AS r(role_name)
CROSS JOIN permissions p
WHERE p.name = 'REVIEW_END_OF_DAY'
ON CONFLICT DO NOTHING;

-- 3. Grant VIEW_AUDIT_LOGS and EXPORT_STAFF_ACTIVITY to HR
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'HR'::user_role, p.permission_id
FROM permissions p
WHERE p.name IN ('VIEW_AUDIT_LOGS', 'EXPORT_STAFF_ACTIVITY')
ON CONFLICT DO NOTHING;

-- 4. Grant VIEW_PAYROLL and POST_PAYROLL_TO_FINANCE to Accountant
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Accountant'::user_role, p.permission_id
FROM permissions p
WHERE p.name IN ('VIEW_PAYROLL', 'POST_PAYROLL_TO_FINANCE', 'VIEW_PAYROLL_JOURNALS')
ON CONFLICT DO NOTHING;

-- 5. Guarantee VIEW_REPORTS for Receptionist and Technician
INSERT INTO role_permissions (role_name, permission_id)
SELECT r.role_name::user_role, p.permission_id
FROM (VALUES ('Receptionist'), ('Technician')) AS r(role_name)
CROSS JOIN permissions p
WHERE p.name = 'VIEW_REPORTS'
ON CONFLICT DO NOTHING;

-- 6. Guarantee VIEW_ROOMS for clinical/intake staff
INSERT INTO role_permissions (role_name, permission_id)
SELECT r.role_name::user_role, p.permission_id
FROM (VALUES ('Receptionist'), ('Technician'), ('Nurse')) AS r(role_name)
CROSS JOIN permissions p
WHERE p.name = 'VIEW_ROOMS'
ON CONFLICT DO NOTHING;
