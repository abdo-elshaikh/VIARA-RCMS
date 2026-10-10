-- 077_audit_classification.sql
-- Adds classification columns to system_logs (category / severity / outcome)
-- and splits the raw "METHOD path" action string into structured columns.
-- Backfills existing rows and adds supporting indexes.
--
-- NOTE: system_logs is append-only (trigger trg_system_logs_append_only from
-- migration 038). The backfill below performs UPDATEs, so we open the
-- maintenance window for the duration of this migration transaction only.
-- applyTrackedMigration wraps this whole file in a single BEGIN/COMMIT, so
-- SET LOCAL is scoped to the migration and reverts automatically on COMMIT.

SET LOCAL VIARA.audit_maintenance = 'on';

ALTER TABLE system_logs
    ADD COLUMN IF NOT EXISTS category    VARCHAR(32),
    ADD COLUMN IF NOT EXISTS severity    SMALLINT     NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS outcome     VARCHAR(16)  NOT NULL DEFAULT 'success',
    ADD COLUMN IF NOT EXISTS http_method VARCHAR(8),
    ADD COLUMN IF NOT EXISTS request_path TEXT;

-- Backfill http_method / request_path from the legacy "METHOD /api/..." action string.
UPDATE system_logs
SET http_method = split_part(action, ' ', 1),
    request_path = NULLIF(substr(action, position(' ' IN action) + 1), '')
WHERE http_method IS NULL
  AND action ~ '^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) ';

-- Backfill outcome from the recorded statusCode in details, where present.
UPDATE system_logs
SET outcome = CASE
        WHEN (details->>'statusCode') ~ '^[0-9]+$' AND (details->>'statusCode')::int = 403 THEN 'denied'
        WHEN (details->>'statusCode') ~ '^[0-9]+$' AND (details->>'statusCode')::int >= 400 THEN 'failure'
        ELSE 'success'
    END
WHERE details ? 'statusCode';

-- Backfill category from the action taxonomy / path where derivable.
UPDATE system_logs
SET category = CASE
        WHEN action ILIKE '%auth%'  OR action ILIKE '%login%' OR action ILIKE '%logout%'
             OR action ILIKE '%password%' OR action ILIKE '%token%'          THEN 'AUTH'
        WHEN action ILIKE '%role%'  OR action ILIKE '%permission%'
             OR request_path ILIKE '%/rbac%'                                 THEN 'RBAC'
        WHEN request_path ILIKE '%/portal/records%' OR request_path ILIKE '%/reports%'
             OR request_path ILIKE '%/documents%'   OR request_path ILIKE '%/dicom%'
             OR request_path ILIKE '%/pacs%'                                 THEN 'PHI_ACCESS'
        WHEN request_path ILIKE '%/invoices%' OR request_path ILIKE '%/payment%'
             OR request_path ILIKE '%/billing%' OR request_path ILIKE '%/refund%'
             OR request_path ILIKE '%/claims%'                               THEN 'BILLING'
        WHEN request_path ILIKE '%/settings%' OR request_path ILIKE '%/config%' THEN 'CONFIG'
        WHEN http_method IN ('POST', 'PUT', 'PATCH', 'DELETE')               THEN 'DATA_WRITE'
        ELSE 'SECURITY'
    END
WHERE category IS NULL;

-- Bump severity for non-success outcomes so failures/denials surface in summaries.
UPDATE system_logs SET severity = 40 WHERE outcome = 'failure' AND severity < 40;
UPDATE system_logs SET severity = 40 WHERE outcome = 'denied'  AND severity < 40;

-- Supporting indexes for the new filter dimensions.
CREATE INDEX IF NOT EXISTS idx_audit_category_time
    ON system_logs (category, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_outcome
    ON system_logs (outcome, timestamp DESC)
    WHERE outcome <> 'success';

CREATE INDEX IF NOT EXISTS idx_audit_severity
    ON system_logs (severity, timestamp DESC)
    WHERE severity >= 40;
