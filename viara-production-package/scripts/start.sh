#!/usr/bin/env bash
# =============================================================================
# VIARA RCMS — Pinned-image launcher for a supported Linux host
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PACKAGE_DIR"

echo "======================================================================"
echo "          🚀 VIARA Radiology Information & PACS System              "
echo "======================================================================"

# 1. Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed or not in PATH."
    echo "   Install Docker Engine (v24+) on the supported Linux host. Docker Desktop is for evaluation only."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Error: Docker Compose (v2.24+) is required."
    exit 1
fi

DOCKER_OS=$(docker info --format '{{.OSType}}' 2>/dev/null || true)
if [ "$DOCKER_OS" != "linux" ]; then
    echo "❌ Error: VIARA release containers require a reachable Linux Docker Engine."
    exit 1
fi

# 2. Check .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "⚠️  .env file not found. Generating from .env.example..."
        cp .env.example .env
    else
        echo "❌ Error: .env file missing."
        exit 1
    fi
fi

# Ensure private permissions on secrets
chmod 600 .env

# 3. Start Docker services
if ! docker compose config --quiet; then
    echo "❌ Error: Compose configuration is incomplete. Check .env and the vendor-issued pinned image references."
    exit 1
fi

if docker compose config --images | grep -qvE '@sha256:[[:xdigit:]]{64}$'; then
    echo "❌ Error: Every service image must use its vendor-approved sha256 digest."
    exit 1
fi

echo "📦 Starting VIARA services..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to initialize and become healthy..."

HEALTH_CHECK_SERVICES="postgres clamav orthanc backend frontend portal ohif"
MAX_WAIT=300
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
    UNHEALTHY_SERVICES=""
    for service in $HEALTH_CHECK_SERVICES; do
        if ! docker compose ps --format json "$service" 2>/dev/null | grep -q '"Health":"healthy"'; then
            UNHEALTHY_SERVICES="${UNHEALTHY_SERVICES} ${service}"
        fi
    done

    if [ -z "$UNHEALTHY_SERVICES" ]; then
        break
    fi

    sleep 5
    ELAPSED=$((ELAPSED + 5))
    echo "Waiting for healthy services:${UNHEALTHY_SERVICES}"
done

if [ -n "$UNHEALTHY_SERVICES" ]; then
    echo "❌ Error: services did not become healthy within ${MAX_WAIT}s:${UNHEALTHY_SERVICES}"
    docker compose ps
    exit 1
fi

# 4. Display deployment summary
DICOM_PORT=$(grep -E "^PACS_DICOM_PORT=" .env | cut -d= -f2 || echo "4242")
AET=$(grep -E "^ORTHANC_AET=" .env | cut -d= -f2 || echo "MiPACS2")

echo "======================================================================"
echo "           ✅ VIARA health-checked services are healthy.               "
echo "======================================================================"
echo "Use the customer-approved HTTPS URLs and reverse proxy."
echo "Published application ports are bound to host loopback."
echo "DICOM AET ${AET}, host port ${DICOM_PORT}: verify PACS_DICOM_BIND and firewall allowlist."
echo "Obtain initial administrator access through the approved secure onboarding procedure."
echo "Orthanc API health is checked; validate device transfer and diagnostic workflows separately."
echo "======================================================================"
