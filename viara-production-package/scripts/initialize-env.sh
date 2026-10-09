#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
template="${1:-$script_dir/../.env.example}"
output="${2:-$script_dir/../.env}"
if [[ -e "$output" ]]; then
    echo 'Existing environment preserved. No keys were changed.'
    exit 0
fi
command -v openssl >/dev/null 2>&1 || { echo 'OpenSSL is required for secure key generation.' >&2; exit 1; }
keys=(POSTGRES_PASSWORD JWT_SECRET ENCRYPTION_KEY BACKUP_ENCRYPTION_KEY BLIND_INDEX_KEY METRICS_TOKEN REDIS_PASSWORD ORTHANC_PASSWORD PACS_WEBHOOK_SECRET)
for key in "${keys[@]}"; do
    count=$(grep -c "^${key}=" "$template" || true)
    [[ "$count" == 1 ]] || { echo "Template must contain exactly one $key assignment." >&2; exit 1; }
done
umask 077
temporary=$(mktemp "${output}.tmp.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    case "${line%%=*}" in
        POSTGRES_PASSWORD|JWT_SECRET|ENCRYPTION_KEY|BACKUP_ENCRYPTION_KEY|BLIND_INDEX_KEY|METRICS_TOKEN|REDIS_PASSWORD|ORTHANC_PASSWORD|PACS_WEBHOOK_SECRET)
            value=$(openssl rand -hex 32)
            [[ "$value" =~ ^[0-9a-f]{64}$ ]] || { echo 'Cryptographic key generation failed.' >&2; exit 1; }
            printf '%s=%s\n' "${line%%=*}" "$value" ;;
        *) printf '%s\n' "$line" ;;
    esac
done < "$template" > "$temporary"
# A hard link publishes the complete file atomically and refuses to replace an existing one.
ln -- "$temporary" "$output"
echo 'Environment initialized with independent cryptographic keys. Values are not logged.'
