#!/usr/bin/env bash
set -e
set -o pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PACKAGE_DIR"

echo "Creating and verifying an encrypted PostgreSQL backup..."
docker compose exec -T backend node -e \
    "require('./src/services/postgresBackupService').createPostgresBackup().then(backup => console.log(backup.filename)).catch(error => { console.error(error.message); process.exitCode = 1; })"
