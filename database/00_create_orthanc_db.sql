-- Creates a dedicated database for the Orthanc PACS index, isolated from the
-- RCMS application schema. Runs once on first container init (before schema.sql
-- and migrations) because docker-entrypoint-initdb.d executes files in name order.
-- The Orthanc PostgreSQL plugin auto-creates its own tables inside this database.
SELECT 'CREATE DATABASE orthanc'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'orthanc')\gexec
