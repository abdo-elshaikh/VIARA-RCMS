#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
template="${1:-$script_dir/../.env.example}"
output="${2:-$script_dir/../.env}"
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1 && python -c 'import sys, secrets; sys.exit(0 if sys.version_info >= (3, 6) else 1)' >/dev/null 2>&1; then
    PYTHON_BIN="python"
fi

if [ -z "$PYTHON_BIN" ]; then
    echo 'Python 3 is required for secure environment initialization.' >&2
    exit 1
fi

"$PYTHON_BIN" - "$template" "$output" <<'PY'
import os
import re
import secrets
import sys
import tempfile
from pathlib import Path

template, output = map(Path, sys.argv[1:])
existing = output.exists()
content = (output if existing else template).read_text(encoding='utf-8-sig')
keys = ('APP_DB_PASSWORD', 'BACKUP_DB_PASSWORD') if existing else (
    'POSTGRES_PASSWORD', 'APP_DB_PASSWORD', 'BACKUP_DB_PASSWORD', 'JWT_SECRET',
    'ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY', 'BLIND_INDEX_KEY', 'METRICS_TOKEN',
    'REDIS_PASSWORD', 'ORTHANC_PASSWORD', 'PACS_WEBHOOK_SECRET')
updated = content
for key in keys:
    pattern = r'(?m)^' + re.escape(key) + r'=[^\r\n]*'
    matches = list(re.finditer(pattern, updated))
    if len(matches) > 1 or (not existing and len(matches) != 1):
        raise SystemExit('Template must contain exactly one ' + key + ' assignment.')
    if existing and matches and matches[0].group() != key + '=':
        continue
    assignment = key + '=' + secrets.token_hex(32)
    updated = re.sub(pattern, assignment, updated) if matches else updated.rstrip('\r\n') + '\n' + assignment + '\n'
if updated != content or not existing:
    descriptor, temporary = tempfile.mkstemp(prefix=output.name + '.tmp-', dir=output.parent)
    try:
        if hasattr(os, 'fchmod'):
            os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        if existing:
            os.replace(temporary, output)
        else:
            os.link(temporary, output)  # Refuse to overwrite an environment created concurrently.
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
print('Existing keys preserved. Database-role passwords initialized without logging values.' if existing else
      'Environment initialized with independent cryptographic keys. Values are not logged.')
PY
