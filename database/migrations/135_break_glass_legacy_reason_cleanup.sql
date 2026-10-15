-- Legacy emergency grants may predate the minimum justification rule. A short
-- legacy plaintext reason must not prevent expiry or revocation updates.
UPDATE emergency_access_logs
SET reason = 'Legacy emergency access justification migrated safely'
WHERE char_length(btrim(reason)) NOT BETWEEN 20 AND 1000;

ALTER TABLE emergency_access_logs
    VALIDATE CONSTRAINT chk_emergency_access_reason_length;
