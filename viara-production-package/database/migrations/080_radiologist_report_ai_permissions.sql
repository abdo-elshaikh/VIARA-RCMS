-- Repair report-authoring permissions for radiologists.
-- Some upgraded databases have the report AI permissions present but not
-- granted to the Radiologist role, causing the report assistant to 403.

INSERT INTO permissions (name, module, description) VALUES
    ('WRITE_REPORTS', 'Clinical', 'Draft and edit diagnostic reports'),
    ('IMPROVE_REPORT_FORMAT', 'Clinical', 'Use AI to reformat and polish report text'),
    ('VIEW_REPORTS', 'Clinical', 'View case reports worklist, print, and export')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Radiologist'::user_role, permission_id
FROM permissions
WHERE name IN ('WRITE_REPORTS', 'IMPROVE_REPORT_FORMAT', 'VIEW_REPORTS')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Developer'::user_role, permission_id
FROM permissions
WHERE name IN ('WRITE_REPORTS', 'IMPROVE_REPORT_FORMAT', 'VIEW_REPORTS')
ON CONFLICT DO NOTHING;
