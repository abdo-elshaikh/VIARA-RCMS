-- Prevent concurrent detection workers from creating duplicate alerts for the
-- same audit event and rule.
WITH ranked_alerts AS (
    SELECT alert_id,
           ROW_NUMBER() OVER (
               PARTITION BY audit_log_id, alert_type
               ORDER BY
                   CASE status WHEN 'resolved' THEN 0 WHEN 'dismissed' THEN 1 WHEN 'reviewing' THEN 2 ELSE 3 END,
                   reviewed_at DESC NULLS LAST,
                   created_at ASC,
                   alert_id
           ) AS duplicate_rank
    FROM audit_alerts
    WHERE audit_log_id IS NOT NULL
)
DELETE FROM audit_alerts alert
USING ranked_alerts ranked
WHERE alert.alert_id = ranked.alert_id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_alerts_log_type
    ON audit_alerts (audit_log_id, alert_type)
    WHERE audit_log_id IS NOT NULL;
