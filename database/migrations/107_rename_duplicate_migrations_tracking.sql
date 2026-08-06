-- Migration: Update schema_migrations tracking table for renamed duplicate migrations
-- This ensures existing deployments don't re-run old migrations or skip new ones.

-- Map old filenames to new filenames in the schema_migrations table.
-- Only inserts the new entries if the old ones exist (idempotent).

INSERT INTO schema_migrations (filename, applied_at, checksum)
SELECT '100_performance_indexes.sql', NOW(), 'renamed'
WHERE EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '004_performance_indexes.sql');

INSERT INTO schema_migrations (filename, applied_at, checksum)
SELECT '101_reporting_indices.sql', NOW(), 'renamed'
WHERE EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '024_reporting_indices.sql');

INSERT INTO schema_migrations (filename, applied_at, checksum)
SELECT '102_encrypt_pii_fields.sql', NOW(), 'renamed'
WHERE EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '030_encrypt_pii_fields.sql');

INSERT INTO schema_migrations (filename, applied_at, checksum)
SELECT '103_refresh_token_audit.sql', NOW(), 'renamed'
WHERE EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '031_refresh_token_audit.sql');

INSERT INTO schema_migrations (filename, applied_at, checksum)
SELECT '104_performance_indexes.sql', NOW(), 'renamed'
WHERE EXISTS (SELECT 1 FROM schema_migrations WHERE filename = '032_performance_indexes.sql');

-- Delete old filename entries so they are not tracked anymore
DELETE FROM schema_migrations WHERE filename = '004_performance_indexes.sql';
DELETE FROM schema_migrations WHERE filename = '024_reporting_indices.sql';
DELETE FROM schema_migrations WHERE filename = '030_encrypt_pii_fields.sql';
DELETE FROM schema_migrations WHERE filename = '031_refresh_token_audit.sql';
DELETE FROM schema_migrations WHERE filename = '032_performance_indexes.sql';
