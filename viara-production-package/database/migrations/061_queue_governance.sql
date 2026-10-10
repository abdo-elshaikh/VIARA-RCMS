-- Separate queue status changes from read-only queue access.
INSERT INTO permissions (name, module, description)
VALUES ('MANAGE_QUEUE', 'Clinical Operations', 'Change exam queue stages and operational routing')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT roles.role_name::user_role, p.permission_id
FROM (VALUES ('Admin'), ('Receptionist'), ('Accountant'), ('Nurse'), ('Technician'), ('Radiologist')) AS roles(role_name)
CROSS JOIN permissions p
WHERE p.name = 'MANAGE_QUEUE'
ON CONFLICT DO NOTHING;
