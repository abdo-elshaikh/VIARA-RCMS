-- Migration 204: Emergency Access Cross-Branch & Resource Scoping (MBT-207)
-- Adds explicit organization, target branch, and target resource context to break-glass emergency elevation.

ALTER TABLE emergency_access_logs
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS target_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS target_resource_id UUID,
    ADD COLUMN IF NOT EXISTS target_resource_type VARCHAR(50);

-- Backfill organization_id from user's organization
UPDATE emergency_access_logs eal
SET organization_id = u.organization_id
FROM users u
WHERE eal.user_id = u.user_id
  AND eal.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Index active emergency access grants by target branch
CREATE INDEX IF NOT EXISTS idx_emergency_access_target_branch
    ON emergency_access_logs(target_branch_id, status)
    WHERE status = 'Active';

CREATE INDEX IF NOT EXISTS idx_emergency_access_org
    ON emergency_access_logs(organization_id, status)
    WHERE status = 'Active';
