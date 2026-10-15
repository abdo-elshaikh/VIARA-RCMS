<#
.SYNOPSIS
    Runs the shared, fail-closed VIARA release packager.
#>
param(
    [ValidateSet("Offline", "Online")]
    [string]$Mode = "Online",
    [string]$OutputDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\")).Path
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js is required to run the release preflight and packager."
}

if ($OutputDir) {
    $outputPath = [System.IO.Path]::GetFullPath($OutputDir)
    $env:VIARA_RELEASE_OUTPUT_DIR = $outputPath
}

Push-Location $repoRoot
try {
    & $node.Source "scripts/package-client-release.js" $Mode
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
