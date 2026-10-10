# VIARA remote-access acceptance checks (Windows / PowerShell).
#
# Mirrors scripts/verify-remote-access.sh for Windows operators and Windows
# Server edge hosts. Verifies the hard rules in deploy/remote-access/README.md.
#
# Usage:
#   .\verify-remote-access.ps1 -ClinicalHost ris.example.org -PortalHost portal.example.org `
#       [-ClientCert C:\certs\rad01.pem [-ClientKey C:\certs\rad01.key]] `
#       [-ClientPfx C:\certs\rad01.pfx -PfxPassword secret]
#
# Notes:
#   - Requires curl.exe (shipped with Windows 10 1803+ / Server 2019+).
#   - Run the clinical checks from a device already on the WireGuard/Zero-Trust
#     network. Without a client certificate the clinical checks verify that mTLS
#     is ENFORCED (they expect failure).
#   - Exit code is non-zero if any check fails.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ClinicalHost,
    [Parameter(Mandatory = $true)][string]$PortalHost,
    [string]$ClientCert,
    [string]$ClientKey,
    [string]$ClientPfx,
    [string]$PfxPassword,
    [string]$ClinicalCA
)

$ErrorActionPreference = 'Stop'

$script:Pass = 0
$script:Fail = 0

function Write-Head([string]$Text) {
    Write-Host ""
    Write-Host $Text -ForegroundColor White
}

function Write-Ok([string]$Text) {
    Write-Host "  PASS $Text" -ForegroundColor Green
    $script:Pass++
}

function Write-Bad([string]$Text) {
    Write-Host "  FAIL $Text" -ForegroundColor Red
    $script:Fail++
}

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    Write-Host "curl.exe is required but was not found on PATH." -ForegroundColor Red
    exit 2
}

# Return the HTTP status code for a URL, or "000" when the request fails.
function Get-Status {
    param([string]$Url, [string[]]$ExtraArgs = @())
    $curlArgs = @('-sS', '--max-time', '15', '-o', 'NUL', '-w', '%{http_code}') + $ExtraArgs + @($Url)
    try {
        $code = & curl.exe @curlArgs 2>$null
        if ([string]::IsNullOrWhiteSpace($code)) { return '000' }
        return $code.Trim()
    } catch {
        return '000'
    }
}

$certArgs = @()
$caArgs = @()
if ($ClinicalCA) { $caArgs = @('--cacert', $ClinicalCA) }
if ($ClientPfx) {
    $certArgs += @('--cert', "$($ClientPfx):$PfxPassword")
} elseif ($ClientCert) {
    if ($ClientKey) { $certArgs += @('--cert', $ClientCert, '--key', $ClientKey) }
    else { $certArgs += @('--cert', $ClientCert) }
}

# ---------------------------------------------------------------- Tier B
Write-Head "Tier B - clinical host: https://$ClinicalHost"

$certArgs += $caArgs
$noCert = Get-Status -Url "https://$ClinicalHost/" -ExtraArgs $caArgs
if (@('000', '400', '403', '495', '496') -contains $noCert) {
    Write-Ok "clinical host rejects a client without a certificate (HTTP $noCert)"
} else {
    Write-Bad "clinical host answered HTTP $noCert without a client certificate"
}

$tls10Args = @('--tlsv1.0', '--tls-max', '1.0') + $caArgs
$tls10 = Get-Status -Url "https://$ClinicalHost/" -ExtraArgs $tls10Args
if ($tls10 -eq '000') {
    Write-Ok "TLS 1.0 was not negotiated by this client (server policy also requires inspection)"
} else {
    Write-Bad "clinical host still negotiates TLS 1.0 (HTTP $tls10)"
}

if ($ClientPfx -or $ClientCert) {
    $fe = Get-Status -Url "https://$ClinicalHost/" -ExtraArgs $certArgs
    if (@('200', '301', '302', '304') -contains $fe) {
        Write-Ok "staff app reachable with client certificate (HTTP $fe)"
    } else {
        Write-Bad "staff app did not answer as expected with a client certificate (HTTP $fe)"
    }

    $ohif = Get-Status -Url "https://$ClinicalHost/pacs-viewer/" -ExtraArgs $certArgs
    if (@('200', '301', '302', '304') -contains $ohif) {
        Write-Ok "OHIF served on the staff origin at /pacs-viewer/ (HTTP $ohif)"
    } else {
        Write-Bad "OHIF not reachable at /pacs-viewer/ on the staff origin (HTTP $ohif)"
    }

    $headers = & curl.exe -sS --max-time 15 @certArgs -D - -o NUL "https://$ClinicalHost/" 2>$null
    if (($headers -join "`n") -match '(?im)^strict-transport-security:') {
        Write-Ok "Strict-Transport-Security header present"
    } else {
        Write-Bad "Strict-Transport-Security header missing"
    }
} else {
    Write-Bad "clinical verification is incomplete: provide a valid client certificate; connection failure alone does not prove mTLS"
}

# ---------------------------------------------------------------- Tier A
Write-Head "Tier A - public portal: https://$PortalHost"

$portalRoot = Get-Status -Url "https://$PortalHost/"
if (@('200', '301', '302', '304') -contains $portalRoot) {
    Write-Ok "portal reachable (HTTP $portalRoot)"
} else {
    Write-Bad "portal did not answer as expected (HTTP $portalRoot)"
}

$deniedPaths = @('/pacs-viewer/', '/pacs/', '/metrics', '/health/', '/dicom-web/', '/wado', '/orthanc', '/admin', '/api/auth/login', '/api/patients', '/api/settings/security', '/api/pacs/dicom-web/studies', '/api/portal/review-requests', '/api/system/update', '/api/backups', '/api/realtime/other')
foreach ($path in $deniedPaths) {
    $st = Get-Status -Url "https://$PortalHost$path"
    if (@('403', '404') -contains $st) {
        Write-Ok "public portal denies $path (HTTP $st)"
    } else {
        Write-Bad "public portal exposes $path (HTTP $st)"
    }
}

$deleteArgs = @('-X', 'DELETE')
$writeSt = Get-Status -Url "https://$PortalHost/api/" -ExtraArgs $deleteArgs
if (@('403', '404', '405') -contains $writeSt) {
    Write-Ok "public portal denies unexpected API verbs (HTTP $writeSt)"
} else {
    Write-Bad "public portal did not deny DELETE /api/ (HTTP $writeSt)"
}

# ---------------------------------------------------------------- Summary
Write-Head "Summary"
Write-Host ("  passed: {0}   failed: {1}" -f $script:Pass, $script:Fail)
if ($script:Fail -gt 0) { exit 1 }
exit 0
