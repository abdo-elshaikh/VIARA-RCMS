#!/usr/bin/env bash
echo "Starting VIARA services (backend, frontend, portal)..."
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
node "$DIR/start-services.js" "$@"
