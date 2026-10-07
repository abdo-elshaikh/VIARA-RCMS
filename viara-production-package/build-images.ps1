<#
.SYNOPSIS
    Builds (and optionally pushes) VIARA application Docker images.

.DESCRIPTION
    Builds viara-backend, viara-frontend, and viara-portal images.
    The version is read from the root package.json when -Version is omitted.
    Use -Registry to tag images for a remote registry.
    Use -Push to push all images after building.

.PARAMETER Version
    Image version tag (e.g. 1.0.0). Defaults to the "version" field in
    the root package.json located two directories above this script.

.PARAMETER Registry
    Optional registry prefix (e.g. ghcr.io/viara-health or
    registry.yourdomain.com). When provided, images are tagged as
    <registry>/<name>:<version> in addition to the local tag.

.PARAMETER Push
    Switch. When present, pushes all built images to the registry.
    Requires -Registry.

.PARAMETER Help
    Switch. Displays this help message and exits.

.EXAMPLE
    # Build with auto-detected version
    .\build-images.ps1

.EXAMPLE
    # Build a specific version
    .\build-images.ps1 -Version 1.1.0

.EXAMPLE
    # Build, tag for GHCR, and push
    .\build-images.ps1 -Version 1.1.0 -Registry ghcr.io/viara-health -Push

.EXAMPLE
    # Build, tag for a private registry, and push
    .\build-images.ps1 -Version 1.1.0 -Registry registry.yourdomain.com -Push
#>

[CmdletBinding()]
param(
    [string]  $Version  = "",
    [string]  $Registry = "",
    [switch]  $Push,
    [switch]  $Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Header([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Write-Step([string]$Text) {
    Write-Host "    $Text" -ForegroundColor White
}

function Write-Success([string]$Text) {
    Write-Host "  ✓ $Text" -ForegroundColor Green
}

function Write-Err([string]$Text) {
    Write-Host "  ✗ $Text" -ForegroundColor Red
}

# ── Help ─────────────────────────────────────────────────────────────────────

if ($Help) {
    Get-Help $MyInvocation.MyCommand.Path -Detailed
    exit 0
}

# ── Resolve paths ─────────────────────────────────────────────────────────────
# This script lives in viara-production-package/; the repo root is one level up.

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = Split-Path -Parent $ScriptDir

# ── Resolve version ───────────────────────────────────────────────────────────

if ($Version -eq "") {
    $PkgJsonPath = Join-Path $RepoRoot "package.json"
    if (-not (Test-Path $PkgJsonPath)) {
        Write-Err "Cannot find $PkgJsonPath. Specify -Version explicitly."
        exit 1
    }
    $PkgJson = Get-Content $PkgJsonPath -Raw | ConvertFrom-Json
    $Version = $PkgJson.version
    if (-not $Version) {
        Write-Err "No 'version' field found in package.json. Specify -Version explicitly."
        exit 1
    }
    Write-Step "Version read from package.json: $Version"
}

# ── Validate -Push requires -Registry ────────────────────────────────────────

if ($Push -and $Registry -eq "") {
    Write-Err "-Push requires -Registry to be specified."
    exit 1
}

# ── Define services ───────────────────────────────────────────────────────────

$Services = @(
    @{ Name = "viara-backend";  Context = Join-Path $RepoRoot "backend"  },
    @{ Name = "viara-frontend"; Context = Join-Path $RepoRoot "frontend" },
    @{ Name = "viara-portal";   Context = Join-Path $RepoRoot "portal"   }
)

$BuiltImages  = @()
$SkippedCount = 0

# ── Build loop ────────────────────────────────────────────────────────────────

Write-Header "Building VIARA images  (version: $Version)"

foreach ($Svc in $Services) {
    $LocalTag = "$($Svc.Name):$Version"

    if (-not (Test-Path $Svc.Context)) {
        Write-Host "  ⚠  Skipping $($Svc.Name) — directory not found: $($Svc.Context)" -ForegroundColor Yellow
        $SkippedCount++
        continue
    }

    Write-Step "Building $LocalTag from $($Svc.Context) ..."
    docker build -t $LocalTag $Svc.Context
    if ($LASTEXITCODE -ne 0) {
        Write-Err "docker build failed for $LocalTag"
        exit $LASTEXITCODE
    }
    Write-Success "Built $LocalTag"
    $BuiltImages += $LocalTag

    # Tag for registry if provided
    if ($Registry -ne "") {
        $RemoteTag = "$Registry/$($Svc.Name):$Version"
        docker tag $LocalTag $RemoteTag
        if ($LASTEXITCODE -ne 0) {
            Write-Err "docker tag failed: $LocalTag -> $RemoteTag"
            exit $LASTEXITCODE
        }
        Write-Success "Tagged  $RemoteTag"
        $BuiltImages += $RemoteTag
    }
}

# ── Push loop ─────────────────────────────────────────────────────────────────

if ($Push) {
    Write-Header "Pushing images to $Registry"

    foreach ($Svc in $Services) {
        if (-not (Test-Path $Svc.Context)) { continue }

        $RemoteTag = "$Registry/$($Svc.Name):$Version"
        Write-Step "Pushing $RemoteTag ..."
        docker push $RemoteTag
        if ($LASTEXITCODE -ne 0) {
            Write-Err "docker push failed for $RemoteTag"
            exit $LASTEXITCODE
        }
        Write-Success "Pushed  $RemoteTag"
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Header "Done"

Write-Host ""
Write-Host "  Images built:" -ForegroundColor White
foreach ($Img in $BuiltImages) {
    Write-Host "    • $Img" -ForegroundColor Green
}

if ($SkippedCount -gt 0) {
    Write-Host ""
    Write-Host "  $SkippedCount service(s) skipped (directory not found)." -ForegroundColor Yellow
}

if (-not $Push -and $Registry -ne "") {
    Write-Host ""
    Write-Host "  To push these images run:" -ForegroundColor White
    Write-Host "    .\build-images.ps1 -Version $Version -Registry $Registry -Push" -ForegroundColor DarkCyan
}

Write-Host ""
Write-Host "  Next step — update .env in viara-production-package/ with:" -ForegroundColor White

foreach ($Svc in $Services) {
    if (-not (Test-Path $Svc.Context)) { continue }
    $EnvKey = ($Svc.Name -replace "-", "_").ToUpper() + "_IMAGE"
    if ($Registry -ne "") {
        Write-Host "    $EnvKey=$Registry/$($Svc.Name):$Version" -ForegroundColor DarkCyan
    } else {
        Write-Host "    $EnvKey=$($Svc.Name):$Version" -ForegroundColor DarkCyan
    }
}

Write-Host ""
