#!/usr/bin/env bash
set -euo pipefail
package_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$package_dir"
for requirement in docker python3 openssl; do
    command -v "$requirement" >/dev/null || { echo "Required: $requirement" >&2; exit 1; }
done
docker compose version >/dev/null
[[ "$(docker info --format '{{.OSType}}')" == linux ]] || { echo 'A Linux Docker Engine is required.' >&2; exit 1; }
bash scripts/initialize-env.sh
if [[ $# -gt 0 || ! -f .setup-complete ]]; then
    python3 scripts/setup-client.py "$@"
fi
bash scripts/start.sh
python3 scripts/initialize-admin.py "$@"
umask 077
touch .setup-complete
