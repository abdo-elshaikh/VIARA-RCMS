#!/usr/bin/env bash
set -e

if [[ "${VIARA_ALLOW_DESTRUCTIVE_DEMO_SEED:-}" != "I_UNDERSTAND_THIS_TRUNCATES_DATA" ]]; then
    echo "Refusing to seed demo data: this operation truncates customer tables."
    echo "Use only on a disposable evaluation database after explicit approval."
    exit 1
fi

if [[ -z "${TEST_USER_PASSWORD:-}" ]]; then
    echo "TEST_USER_PASSWORD must be set in the calling shell; it will not be read from or written to .env."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PACKAGE_DIR"

echo "Seeding demo data into the explicitly approved disposable evaluation database..."
docker compose exec -e TEST_USER_PASSWORD backend node seed.js
