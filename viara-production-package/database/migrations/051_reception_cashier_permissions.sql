-- Allow reception staff to operate a personal cashier drawer while retaining
-- separation from refund approval, shift reconciliation, and variance review.
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Receptionist'::user_role, permission_id
FROM permissions
WHERE name IN (
    'VIEW_INVOICES',
    'PROCESS_PAYMENTS',
    'OPEN_CASHIER_SHIFT',
    'CLOSE_CASHIER_SHIFT',
    'REQUEST_REFUNDS',
    'PROCESS_REFUNDS'
)
ON CONFLICT DO NOTHING;
