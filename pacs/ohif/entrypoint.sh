#!/bin/sh
set -eu
: "${VIARA_API_UPSTREAM:=backend:3000}"
: "${VIARA_APP_ORIGIN:=http://localhost:5173}"
export VIARA_API_UPSTREAM VIARA_APP_ORIGIN
case "$VIARA_API_UPSTREAM" in *[!a-zA-Z0-9.:-]*) echo 'Invalid API upstream' >&2; exit 1;; esac
case "$VIARA_APP_ORIGIN" in http://*|https://*) ;; *) echo 'An HTTP(S) application origin is required' >&2; exit 1;; esac
VIARA_APP_ORIGIN=${VIARA_APP_ORIGIN%/}
case "$VIARA_APP_ORIGIN" in *://*/*) echo 'The application origin must not include a path' >&2; exit 1;; esac
case "$VIARA_APP_ORIGIN" in *[!a-zA-Z0-9.:/-]*) echo 'Invalid application origin' >&2; exit 1;; esac
export VIARA_APP_ORIGIN
if [ "${VIARA_API_UPSTREAM%:*}" = 'host.docker.internal' ]; then
  host_address=$(getent ahostsv4 host.docker.internal | awk '$1 ~ /^[0-9.]+$/ { print $1; exit }')
  [ -n "$host_address" ] || { echo 'Host backend address is unavailable' >&2; exit 1; }
  VIARA_API_UPSTREAM="$host_address:${VIARA_API_UPSTREAM##*:}"
  export VIARA_API_UPSTREAM
fi
envsubst '${VIARA_API_UPSTREAM} ${VIARA_APP_ORIGIN}' < /usr/src/default.conf.template > /etc/nginx/conf.d/default.conf
nginx -t
exec "$@"
