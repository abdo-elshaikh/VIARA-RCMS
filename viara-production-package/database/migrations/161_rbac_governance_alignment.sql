-- 161: RBAC governance alignment & permission risk levels
--
-- 1) MANAGE_ROLES is Admin/Developer-only (matches rbacRoutes guards and the
--    admin UI). HR manages people, not security policy — remove the stale
--    grant so governance code, routes, and the UI agree on one rule.
DELETE FROM role_permissions rp
USING permissions p
WHERE rp.permission_id = p.permission_id
  AND rp.role_name = 'HR'
  AND p.name = 'MANAGE_ROLES';

-- 2) Permission risk levels become data (single source of truth) instead of a
--    client-side name-regex guess. Seed values mirror the previous heuristic,
--    extended with ASSIGN/RESOLVE verbs so newer permissions are not mislabeled.
ALTER TABLE permissions
    ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'standard'
    CHECK (risk_level IN ('standard', 'sensitive', 'critical'));

UPDATE permissions SET risk_level = CASE
    WHEN name ~ '^(DELETE|MERGE|FINALIZE|AMEND|ISSUE_REFUNDS|CLOSE_|MANAGE_ROLES|MANAGE_USERS|MANAGE_BACKUPS|MANAGE_SETTINGS|MANAGE_INTEGRATIONS|ANONYMIZE|RESTORE_BACKUPS|MANAGE_DEVELOPER_ROLE|MANAGE_PROTECTED_ROLES|MANAGE_DATABASE_CONFIG|MANAGE_SYSTEM_RUNTIME|MANAGE_SECRET_SETTINGS|LOCK_PAYROLL|VOID_INVOICES)' THEN 'critical'
    WHEN name ~ '^(CREATE|EDIT|PERFORM|WRITE|REVIEW|APPROVE|DELIVER|PROCESS|MANAGE|EXPORT|ADJUST|RECEIVE|APPLY|DOWNLOAD|OVERRIDE|RECONCILE|IMPORT|UPLOAD|CALCULATE|PAY_|POST_|SUBMIT_|REQUEST_|ASSIGN|RESOLVE)' THEN 'sensitive'
    ELSE 'standard'
END;
