#!/usr/bin/env bash
# VIARA remote-access acceptance checks.
#
# Run on the edge host (or any host that can reach both tiers). Verifies the
# hard rules from deploy/remote-access/README.md. Exits non-zero on any failure.
#
# Usage:
#   bash verify-remote-access.sh <clinical-host> <portal-host> [client-cert] [client-key]
#
# Examples:
#   bash verify-remote-access.sh ris.example.org portal.example.org
#   bash verify-remote-access.sh ris.example.org portal.example.org ~/rad01.pem ~/rad01.key
#
# Notes:
#   - The clinical host is expected to be reachable only over WireGuard; run this
#     from a device that is already on the tunnel.
#   - Without a client certificate, the clinical checks verify that mTLS is
#     ENFORCED (they expect failure). With a client certificate, they verify the
#     staff/OHIF paths work.

set -u

CLINICAL_HOST="${1:-}"
PORTAL_HOST="${2:-}"
CLIENT_CERT="${3:-}"
CLIENT_KEY="${4:-}"
CLINICAL_CA="${5:-}"
CA_ARGS=()
if [[ -n "$CLINICAL_CA" ]]; then CA_ARGS=(--cacert "$CLINICAL_CA"); fi

if [[ -z "$CLINICAL_HOST" || -z "$PORTAL_HOST" ]]; then
    echo "usage: $0 <clinical-host> <portal-host> [client-cert] [client-key]" >&2
    exit 2
fi

PASS=0
FAIL=0
CURL="curl -sS --max-time 15"

ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

status_of() {
    # status_of <url> [curl args...]
    local url="$1"; shift
    local status
    status="$($CURL -o /dev/null -w '%{http_code}' "$@" "$url")" || { printf '000'; return; }
    printf '%s' "$status"
}

head "Tier B — clinical host: https://${CLINICAL_HOST}"

# 1. mTLS is enforced: a request without a client certificate must NOT succeed.
#    nginx answers 400 (no cert presented) or 496 when verification fails; a
#    firewall may simply drop the connection (curl reports 000).
no_cert_status="$(status_of "https://${CLINICAL_HOST}/" "${CA_ARGS[@]}")"
if [[ "$no_cert_status" == "000" || "$no_cert_status" == "400" || "$no_cert_status" == "495" || "$no_cert_status" == "496" || "$no_cert_status" == "403" ]]; then
    ok "clinical host rejects a client without a certificate (HTTP ${no_cert_status})"
else
    bad "clinical host answered HTTP ${no_cert_status} without a client certificate"
fi

# 2. TLS 1.2+ only.
if $CURL "${CA_ARGS[@]}" --tlsv1.0 --tls-max 1.0 -o /dev/null "https://${CLINICAL_HOST}/" >/dev/null 2>&1; then
    bad "clinical host still negotiates TLS 1.0"
else
    ok "TLS 1.0 was not negotiated by this client (server policy also requires inspection)"
fi

if [[ -n "$CLIENT_CERT" && -n "$CLIENT_KEY" ]]; then
    CERT_ARGS=(--cert "$CLIENT_CERT" --key "$CLIENT_KEY" "${CA_ARGS[@]}")

    # 3. Staff app reachable with a valid client certificate.
    fe_status="$(status_of "https://${CLINICAL_HOST}/" "${CERT_ARGS[@]}")"
    if [[ "$fe_status" =~ ^(200|301|302|304)$ ]]; then
        ok "staff app reachable with client certificate (HTTP ${fe_status})"
    else
        bad "staff app did not answer as expected with a client certificate (HTTP ${fe_status})"
    fi

    # 4. OHIF stays on the staff origin under /pacs-viewer/.
    ohif_status="$(status_of "https://${CLINICAL_HOST}/pacs-viewer/" "${CERT_ARGS[@]}")"
    if [[ "$ohif_status" =~ ^(200|301|302|304)$ ]]; then
        ok "OHIF served on the staff origin at /pacs-viewer/ (HTTP ${ohif_status})"
    else
        bad "OHIF not reachable at /pacs-viewer/ on the staff origin (HTTP ${ohif_status})"
    fi

    # 5. HSTS present on the clinical origin.
    if $CURL -D - -o /dev/null "${CERT_ARGS[@]}" "https://${CLINICAL_HOST}/" 2>/dev/null | grep -qi '^strict-transport-security:'; then
        ok "Strict-Transport-Security header present"
    else
        bad "Strict-Transport-Security header missing"
    fi
else
    bad "clinical verification is incomplete: provide a valid client certificate; connection failure alone does not prove mTLS"
fi

head "Tier A — public portal: https://${PORTAL_HOST}"

# 6. Portal health reachable.
portal_root="$(status_of "https://${PORTAL_HOST}/")"
if [[ "$portal_root" =~ ^(200|301|302|304)$ ]]; then
    ok "portal reachable (HTTP ${portal_root})"
else
    bad "portal did not answer as expected (HTTP ${portal_root})"
fi

# 7. Clinical viewer must NOT be public.
for path in /pacs-viewer/ /pacs/ /metrics /health/ /dicom-web/ /wado /orthanc /admin /api/auth/login /api/patients /api/settings/security /api/pacs/dicom-web/studies /api/portal/review-requests /api/system/update /api/backups /api/realtime/other; do
    st="$(status_of "https://${PORTAL_HOST}${path}")"
    if [[ "$st" == "404" || "$st" == "403" ]]; then
        ok "public portal denies ${path} (HTTP ${st})"
    else
        bad "public portal exposes ${path} (HTTP ${st})"
    fi
done

# 8. Public portal must not accept arbitrary write verbs on API root.
write_st="$(status_of "https://${PORTAL_HOST}/api/" -X DELETE)"
if [[ "$write_st" == "403" || "$write_st" == "404" || "$write_st" == "405" ]]; then
    ok "public portal denies unexpected API verbs (HTTP ${write_st})"
else
    bad "public portal did not deny DELETE /api/ (HTTP ${write_st})"
fi

head "Summary"
printf '  passed: %d   failed: %d\n' "$PASS" "$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
    exit 1
fi
exit 0
