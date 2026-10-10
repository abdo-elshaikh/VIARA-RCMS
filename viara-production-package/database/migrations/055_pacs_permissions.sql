-- Ensure PACS viewer/reconciliation permissions exist in databases created
-- before the PACS settings initializer seeded them.

INSERT INTO permissions (name, module, description) VALUES
    ('VIEW_PACS_IMAGES', 'PACS', 'View DICOM studies in the diagnostic image viewer'),
    ('MANAGE_PACS', 'PACS', 'Configure PACS/modality settings and operate the imaging archive'),
    ('RECONCILE_STUDIES', 'PACS', 'Reconcile quarantined DICOM studies to scheduled examinations')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT CAST('Admin' AS user_role), permission_id
FROM permissions
WHERE name IN ('VIEW_PACS_IMAGES', 'MANAGE_PACS', 'RECONCILE_STUDIES')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT CAST(role_name AS user_role), permission_id
FROM permissions
CROSS JOIN (VALUES ('Radiologist'), ('Technician')) AS roles(role_name)
WHERE name IN ('VIEW_PACS_IMAGES', 'RECONCILE_STUDIES')
ON CONFLICT DO NOTHING;
