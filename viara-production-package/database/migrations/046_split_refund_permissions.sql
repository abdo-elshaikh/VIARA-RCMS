-- Split refund responsibilities by action while preserving legacy ISSUE_REFUNDS compatibility.

INSERT INTO permissions (name, module, description) VALUES
('REQUEST_REFUNDS', 'Billing', 'Create refund requests for collected patient payments'),
('APPROVE_REFUNDS', 'Billing', 'Approve or reject pending refund requests'),
('PROCESS_REFUNDS', 'Billing', 'Execute approved refunds and post cash movement')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

-- Admin keeps full access.
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id
FROM permissions
WHERE name IN ('REQUEST_REFUNDS', 'APPROVE_REFUNDS', 'PROCESS_REFUNDS')
ON CONFLICT DO NOTHING;

-- Reception acts as cashier/front-desk: can request and process, but not approve.
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Receptionist'::user_role, permission_id
FROM permissions
WHERE name IN ('REQUEST_REFUNDS', 'PROCESS_REFUNDS')
ON CONFLICT DO NOTHING;

-- Accountant can request, approve, and process as finance owner.
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Accountant'::user_role, permission_id
FROM permissions
WHERE name IN ('REQUEST_REFUNDS', 'APPROVE_REFUNDS', 'PROCESS_REFUNDS')
ON CONFLICT DO NOTHING;
