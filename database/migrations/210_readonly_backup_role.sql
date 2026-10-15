DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viara_backup_reader') THEN
        CREATE ROLE viara_backup_reader NOLOGIN;
    END IF;
END $$;
ALTER ROLE viara_backup_reader NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
GRANT USAGE ON SCHEMA public TO viara_backup_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO viara_backup_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO viara_backup_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO viara_backup_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO viara_backup_reader;
-- This credential is restricted to encrypted whole-instance backup operations.
-- It cannot change data and must never be used as the application connection.
