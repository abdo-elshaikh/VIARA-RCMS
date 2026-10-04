-- Case Reports RBAC migration.
-- Adds report viewing + AI formatting permissions and aligns clinical role grants
-- so the /api/case-reports, /lookup, report PDF, and deliver endpoints can move
-- from role-based guards to permission-based (hasAnyPermission) authorization.
-- Reuses the existing DELIVER_RESULTS permission (added in 033) for report delivery.

INSERT INTO permissions (name, module, description) VALUES
    ('VIEW_REPORTS', 'Clinical', 'View case reports worklist, print, and export'),
    ('IMPROVE_REPORT_FORMAT', 'Clinical', 'Use AI to reformat and polish report text')
ON CONFLICT (name) DO NOTHING;

-- Administrator is immutable full access.
INSERT INTO role_permissions (role_name, permission_id)
SELECT CAST('Admin' AS user_role), permission_id
FROM permissions
WHERE name IN ('VIEW_REPORTS', 'IMPROVE_REPORT_FORMAT')
ON CONFLICT DO NOTHING;

-- Report viewing for every clinical/front-desk role that previously had list access.
INSERT INTO role_permissions (role_name, permission_id)
SELECT CAST(role_name AS user_role), permission_id
FROM permissions
CROSS JOIN (VALUES ('Radiologist'), ('Technician'), ('Nurse'), ('Receptionist')) AS roles(role_name)
WHERE name = 'VIEW_REPORTS'
ON CONFLICT DO NOTHING;

-- AI-assisted formatting is authored by radiologists.
INSERT INTO role_permissions (role_name, permission_id)
SELECT CAST('Radiologist' AS user_role), permission_id
FROM permissions
WHERE name = 'IMPROVE_REPORT_FORMAT'
ON CONFLICT DO NOTHING;

-- Receptionist can release results (Radiologist/Nurse already granted DELIVER_RESULTS in 033).
INSERT INTO role_permissions (role_name, permission_id)
SELECT CAST('Receptionist' AS user_role), permission_id
FROM permissions
WHERE name = 'DELIVER_RESULTS'
ON CONFLICT DO NOTHING;
