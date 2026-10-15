-- Developer role governance and technical permissions.

INSERT INTO permissions (name, module, description) VALUES
('MANAGE_DEVELOPER_ROLE', 'System', 'Create, assign, and govern Developer accounts'),
('MANAGE_PROTECTED_ROLES', 'System', 'Manage Developer and Admin role permissions and assignments'),
('MANAGE_DATABASE_CONFIG', 'System', 'View, test, and update database connection configuration'),
('VIEW_SYSTEM_DIAGNOSTICS', 'System', 'View runtime, database, and service health diagnostics'),
('MANAGE_SYSTEM_RUNTIME', 'System', 'Operate runtime cache, background jobs, and maintenance controls'),
('MANAGE_FEATURE_FLAGS', 'System', 'Create and update system feature flags'),
('VIEW_MIGRATION_STATUS', 'System', 'View database migration status and history'),
('MANAGE_SECRET_SETTINGS', 'System', 'Create and rotate secret-bearing provider settings'),
('RESTORE_BACKUPS', 'System', 'Restore backups into the active system'),
('DOWNLOAD_BACKUPS', 'System', 'Download generated backup artifacts')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

-- Developer is the technical super-role and receives every current permission.
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Developer'::user_role, permission_id
FROM permissions
ON CONFLICT DO NOTHING;

-- Admin remains powerful operationally, but does not retain technical boundary controls.
DELETE FROM role_permissions rp
USING permissions p
WHERE rp.permission_id = p.permission_id
  AND rp.role_name = 'Admin'::user_role
  AND p.name IN (
      'MANAGE_DEVELOPER_ROLE',
      'MANAGE_PROTECTED_ROLES',
      'MANAGE_DATABASE_CONFIG',
      'VIEW_SYSTEM_DIAGNOSTICS',
      'MANAGE_SYSTEM_RUNTIME',
      'MANAGE_FEATURE_FLAGS',
      'VIEW_MIGRATION_STATUS',
      'MANAGE_SECRET_SETTINGS',
      'RESTORE_BACKUPS'
  );
