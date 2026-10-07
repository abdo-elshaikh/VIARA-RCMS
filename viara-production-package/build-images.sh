#!/usr/bin/env bash
# =============================================================================
# build-images.sh — Build (and optionally push) VIARA application Docker images
# =============================================================================
# Usage:
#   ./build-images.sh [OPTIONS]
#
# Options:
#   --version <string>   Image version tag (default: read from root package.json)
#   --registry <string>  Registry prefix, e.g. ghcr.io/viara-health
#   --push               Push images to the registry after building
#   --help               Show this help message and exit
#
# Examples:
#   ./build-images.sh
#   ./build-images.sh --version 1.1.0
#   ./build-images.sh --version 1.1.0 --registry ghcr.io/viara-health --push
#   ./build-images.sh --version 1.1.0 --registry registry.yourdomain.com --push
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; NC='\033[0m'  # No Colour

header()  { echo -e "\n${CYAN}==> $*${NC}"; }
step()    { echo -e "    $*"; }
success() { echo -e "  ${GREEN}✓ $*${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠  $*${NC}"; }
err()     { echo -e "  ${RED}✗ $*${NC}" >&2; }

# ── Argument parsing ──────────────────────────────────────────────────────────
VERSION=""
REGISTRY=""
PUSH=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)
            VERSION="$2"; shift 2 ;;
        --registry)
            REGISTRY="$2"; shift 2 ;;
        --push)
            PUSH=true; shift ;;
        --help|-h)
            sed -n '/^# Usage:/,/^# ====/p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *)
            err "Unknown option: $1"
            err "Run with --help for usage."
            exit 1 ;;
    esac
done

# ── Resolve paths ─────────────────────────────────────────────────────────────
# This script lives in viara-production-package/; the repo root is one level up.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Resolve version ───────────────────────────────────────────────────────────
if [[ -z "$VERSION" ]]; then
    PKG_JSON="$REPO_ROOT/package.json"
    if [[ ! -f "$PKG_JSON" ]]; then
        err "Cannot find $PKG_JSON. Specify --version explicitly."
        exit 1
    fi
    if command -v node &>/dev/null; then
        VERSION="$(node -e "process.stdout.write(require('$PKG_JSON').version)")"
    elif command -v python3 &>/dev/null; then
        VERSION="$(python3 -c "import json,sys; print(json.load(open('$PKG_JSON'))['version'], end='')")"
    else
        err "Cannot parse package.json: neither node nor python3 found. Specify --version explicitly."
        exit 1
    fi
    step "Version read from package.json: $VERSION"
fi

# ── Validate --push requires --registry ──────────────────────────────────────
if $PUSH && [[ -z "$REGISTRY" ]]; then
    err "--push requires --registry to be specified."
    exit 1
fi

# ── Service definitions ───────────────────────────────────────────────────────
declare -a SVC_NAMES=( viara-backend viara-frontend viara-portal )
declare -a SVC_DIRS=(
    "$REPO_ROOT/backend"
    "$REPO_ROOT/frontend"
    "$REPO_ROOT/portal"
)

BUILT_IMAGES=()
SKIPPED=0

# ── Build loop ────────────────────────────────────────────────────────────────
header "Building VIARA images  (version: $VERSION)"

for i in "${!SVC_NAMES[@]}"; do
    NAME="${SVC_NAMES[$i]}"
    CTX="${SVC_DIRS[$i]}"
    LOCAL_TAG="${NAME}:${VERSION}"

    if [[ ! -d "$CTX" ]]; then
        warn "Skipping $NAME — directory not found: $CTX"
        (( SKIPPED++ )) || true
        continue
    fi

    step "Building $LOCAL_TAG from $CTX ..."
    docker build -t "$LOCAL_TAG" "$CTX"
    success "Built $LOCAL_TAG"
    BUILT_IMAGES+=("$LOCAL_TAG")

    if [[ -n "$REGISTRY" ]]; then
        REMOTE_TAG="${REGISTRY}/${NAME}:${VERSION}"
        docker tag "$LOCAL_TAG" "$REMOTE_TAG"
        success "Tagged  $REMOTE_TAG"
        BUILT_IMAGES+=("$REMOTE_TAG")
    fi
done

# ── Push loop ─────────────────────────────────────────────────────────────────
if $PUSH; then
    header "Pushing images to $REGISTRY"

    for i in "${!SVC_NAMES[@]}"; do
        NAME="${SVC_NAMES[$i]}"
        CTX="${SVC_DIRS[$i]}"
        [[ ! -d "$CTX" ]] && continue

        REMOTE_TAG="${REGISTRY}/${NAME}:${VERSION}"
        step "Pushing $REMOTE_TAG ..."
        docker push "$REMOTE_TAG"
        success "Pushed  $REMOTE_TAG"
    done
fi

# ── Summary ───────────────────────────────────────────────────────────────────
header "Done"

echo ""
echo "  Images built:"
for img in "${BUILT_IMAGES[@]}"; do
    echo -e "    ${GREEN}•${NC} $img"
done

if (( SKIPPED > 0 )); then
    echo ""
    warn "$SKIPPED service(s) skipped (directory not found)."
fi

if ! $PUSH && [[ -n "$REGISTRY" ]]; then
    echo ""
    echo "  To push these images run:"
    echo -e "    ${CYAN}./build-images.sh --version $VERSION --registry $REGISTRY --push${NC}"
fi

echo ""
echo "  Next step — update .env in viara-production-package/ with:"
for i in "${!SVC_NAMES[@]}"; do
    NAME="${SVC_NAMES[$i]}"
    CTX="${SVC_DIRS[$i]}"
    [[ ! -d "$CTX" ]] && continue
    ENV_KEY="$(echo "$NAME" | tr '[:lower:]-' '[:upper:]_')_IMAGE"
    if [[ -n "$REGISTRY" ]]; then
        echo -e "    ${CYAN}${ENV_KEY}=${REGISTRY}/${NAME}:${VERSION}${NC}"
    else
        echo -e "    ${CYAN}${ENV_KEY}=${NAME}:${VERSION}${NC}"
    fi
done
echo ""
