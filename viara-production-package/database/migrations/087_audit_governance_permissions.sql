-- 087_audit_governance_permissions.sql
-- Granular audit-governance permissions. Viewing audit trails is different
-- from exporting evidence, running detections, reviewing alerts, or verifying
-- integrity, so those actions are permissioned separately.

INSERT INTO permissions (name, module, description) VALUES
('VIEW_AUDIT_TRAILS', 'System', 'View system logs, structured audit events, and audit alerts'),
('EXPORT_AUDIT_TRAILS', 'System', 'Export system audit trails and event logs'),
('VERIFY_AUDIT_CHAIN', 'System', 'Verify tamper-evident audit hash chains'),
('RUN_AUDIT_DETECTIONS', 'System', 'Run audit detection rules and create audit alerts'),
('REVIEW_AUDIT_ALERTS', 'System', 'Resolve or dismiss audit detection alerts')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id
FROM permissions
WHERE name IN (
    'VIEW_AUDIT_TRAILS',
    'EXPORT_AUDIT_TRAILS',
    'VERIFY_AUDIT_CHAIN',
    'RUN_AUDIT_DETECTIONS',
    'REVIEW_AUDIT_ALERTS'
)
ON CONFLICT DO NOTHING;

-- Accountants can inspect audit trails for finance reconciliation, but should
-- not export, close alerts, or run detections by default.
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Accountant'::user_role, permission_id
FROM permissions
WHERE name = 'VIEW_AUDIT_TRAILS'
ON CONFLICT DO NOTHING;
