#!/usr/bin/env bash
set -e
set -o pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PACKAGE_DIR"

if [ -z "$1" ] || [ "$1" = "--list" ] || [ "$1" = "-l" ]; then
    echo "========================================================"
    echo "  VIARA-RCMS Available Backups"
    echo "========================================================"
    docker compose exec -T backend node scripts/restorePostgresBackup.js --list
    echo ""
    echo "Usage:"
    echo "  ./scripts/restore.sh <BACKUP_FILENAME> [--confirm] [--verify-only] [--skip-pacs]"
    echo ""
    echo "Example (dry-run verify only):"
    echo "  ./scripts/restore.sh VIARA_pg_...dump.enc --verify-only"
    echo ""
    echo "Example (production restore):"
    echo "  ./scripts/restore.sh VIARA_pg_...dump.enc --confirm"
    exit 0
fi

BACKUP_FILE="$1"
shift

echo "========================================================"
echo "  VIARA-RCMS Disaster Recovery & Restore"
echo "========================================================"
echo "Target Backup: $BACKUP_FILE"
echo ""

docker compose exec -T backend node scripts/restorePostgresBackup.js --file="$BACKUP_FILE" "$@"
