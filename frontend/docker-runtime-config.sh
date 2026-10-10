#!/bin/sh
set -eu
if [ -n "${PORTAL_PUBLIC_URL:-}" ]; then
    # Only a validated origin is emitted into JavaScript; never arbitrary text.
    printf '%s' "$PORTAL_PUBLIC_URL" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' || {
        echo 'PORTAL_PUBLIC_URL must be an HTTPS origin without a path.' >&2
        exit 1
    }
    printf 'window.__VIARA_CONFIG__ = {"portalPublicUrl":"%s"};\n' "$PORTAL_PUBLIC_URL" > /usr/share/nginx/html/runtime-config.js
fi
