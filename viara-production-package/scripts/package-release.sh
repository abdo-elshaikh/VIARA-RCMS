#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-Online}"
OUTPUT_DIR="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ "$MODE" != "Online" && "$MODE" != "Offline" ]]; then
    echo "Packaging mode must be Online or Offline." >&2
    exit 2
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required to run the release preflight and packager." >&2
    exit 1
fi

if [[ -n "$OUTPUT_DIR" ]]; then
    export VIARA_RELEASE_OUTPUT_DIR="$OUTPUT_DIR"
fi

cd "$REPO_ROOT"
exec node scripts/package-client-release.js "$MODE"
