-- Dedicated approval capability for invoice discounts applied during collection.
INSERT INTO permissions (name, module, description) VALUES
('APPLY_DISCOUNTS', 'Billing', 'Apply an authorized invoice discount with a recorded reason')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT role_name, permission_id
FROM (VALUES ('Admin'::user_role), ('Accountant'::user_role)) AS roles(role_name)
CROSS JOIN permissions
WHERE name = 'APPLY_DISCOUNTS'
ON CONFLICT DO NOTHING;
