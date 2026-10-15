CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE system_logs
    ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_logs_entry_hash
    ON system_logs(entry_hash)
    WHERE entry_hash IS NOT NULL;

DO $$
DECLARE
    row_record RECORD;
    prior_hash VARCHAR(64) := repeat('0', 64);
    calculated_hash VARCHAR(64);
BEGIN
    FOR row_record IN SELECT * FROM system_logs ORDER BY log_id LOOP
        calculated_hash := encode(digest(
            concat_ws('|', prior_hash, COALESCE(row_record.user_id::text, ''), row_record.action,
                      COALESCE(row_record.resource_id::text, ''), COALESCE(row_record.resource_table, ''),
                      COALESCE(row_record.ip_address, ''), COALESCE(row_record.details::text, ''),
                      COALESCE(row_record.timestamp::text, '')),
            'sha256'
        ), 'hex');
        UPDATE system_logs
        SET previous_hash = prior_hash, entry_hash = calculated_hash
        WHERE log_id = row_record.log_id;
        prior_hash := calculated_hash;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION VIARA_chain_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    last_hash VARCHAR(64);
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('VIARA_system_logs_chain'));
    SELECT entry_hash INTO last_hash
    FROM system_logs
    ORDER BY log_id DESC
    LIMIT 1;

    NEW.previous_hash := COALESCE(last_hash, repeat('0', 64));
    NEW.entry_hash := encode(digest(
        concat_ws('|', NEW.previous_hash, COALESCE(NEW.user_id::text, ''), NEW.action,
                  COALESCE(NEW.resource_id::text, ''), COALESCE(NEW.resource_table, ''),
                  COALESCE(NEW.ip_address, ''), COALESCE(NEW.details::text, ''),
                  COALESCE(NEW.timestamp::text, '')),
        'sha256'
    ), 'hex');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_logs_chain ON system_logs;
CREATE TRIGGER trg_system_logs_chain
BEFORE INSERT ON system_logs
FOR EACH ROW EXECUTE FUNCTION VIARA_chain_audit_log();

CREATE OR REPLACE FUNCTION VIARA_protect_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('VIARA.audit_maintenance', TRUE) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'system_logs are append-only';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_logs_append_only ON system_logs;
CREATE TRIGGER trg_system_logs_append_only
BEFORE UPDATE OR DELETE ON system_logs
FOR EACH ROW EXECUTE FUNCTION VIARA_protect_audit_log();
