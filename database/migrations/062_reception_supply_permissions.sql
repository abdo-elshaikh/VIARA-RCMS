-- Allow reception and cashier staff to append billable supplies to an exam.
-- The existing CONSUME_INVENTORY permission keeps this action auditable and scoped.
INSERT INTO role_permissions (role_name, permission_id)
SELECT roles.role_name::user_role, permissions.permission_id
FROM (VALUES ('Receptionist'), ('Cashier')) AS roles(role_name)
CROSS JOIN permissions
WHERE permissions.name = 'CONSUME_INVENTORY'
ON CONFLICT DO NOTHING;
