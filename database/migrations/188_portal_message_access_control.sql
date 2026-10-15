INSERT INTO permissions (name, module, description)
VALUES ('VIEW_PORTAL_MESSAGES', 'Communications', 'View patient and referring-doctor portal conversations')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT role_name::user_role, permission_id
FROM (VALUES ('Admin'), ('Receptionist')) AS allowed_roles(role_name)
CROSS JOIN (SELECT permission_id FROM permissions WHERE name = 'VIEW_PORTAL_MESSAGES') AS portal_message_permission
ON CONFLICT DO NOTHING;
