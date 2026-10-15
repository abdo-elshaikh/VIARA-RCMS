[CmdletBinding()]
param(
    [string]$TemplatePath,
    [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
if (-not $TemplatePath) { $TemplatePath = Join-Path $PSScriptRoot '..\.env.example' }
if (-not $OutputPath) { $OutputPath = Join-Path $PSScriptRoot '..\.env' }
if (Test-Path -LiteralPath $OutputPath) {
    $existing = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $OutputPath).Path)
    $updated = $existing
    $upgradeRng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        foreach ($name in @('APP_DB_PASSWORD', 'BACKUP_DB_PASSWORD')) {
            $pattern = '(?m)^' + [regex]::Escape($name) + '=[^\r\n]*'
            $matches = [regex]::Matches($updated, $pattern)
            if ($matches.Count -gt 1) { throw "Duplicate $name assignment; resolve it before upgrade." }
            if ($matches.Count -eq 1 -and $matches[0].Value -ne ($name + '=')) { continue }
            $bytes = New-Object byte[] 32
            $upgradeRng.GetBytes($bytes)
            $value = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
            if ($matches.Count -eq 1) { $updated = [regex]::Replace($updated, $pattern, ($name + '=' + $value)) }
            else { $updated += [Environment]::NewLine + $name + '=' + $value + [Environment]::NewLine }
        }
        if ($updated -ne $existing) {
            $temporary = $OutputPath + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
            try {
                [IO.File]::WriteAllText($temporary, $updated, (New-Object Text.UTF8Encoding($false)))
                Move-Item -LiteralPath $temporary -Destination $OutputPath -Force
            } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary } }
        }
    } finally { $upgradeRng.Dispose() }
    Write-Host 'Existing keys preserved. Missing database-role passwords initialized without logging values.'
    exit 0
}
$content = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $TemplatePath).Path)
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    foreach ($name in @('POSTGRES_PASSWORD', 'APP_DB_PASSWORD', 'BACKUP_DB_PASSWORD', 'JWT_SECRET', 'ENCRYPTION_KEY',
        'BACKUP_ENCRYPTION_KEY', 'BLIND_INDEX_KEY', 'METRICS_TOKEN',
        'REDIS_PASSWORD', 'ORTHANC_PASSWORD', 'PACS_WEBHOOK_SECRET')) {
        $pattern = '(?m)^' + [regex]::Escape($name) + '=[^\r\n]*'
        if ([regex]::Matches($content, $pattern).Count -ne 1) {
            throw "Template must contain exactly one $name assignment."
        }
        $bytes = New-Object byte[] 32
        $rng.GetBytes($bytes)
        $value = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
        $content = [regex]::Replace($content, $pattern, ($name + '=' + $value))
    }
    $stream = New-Object IO.FileStream($OutputPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try {
        $encoding = New-Object Text.UTF8Encoding($false)
        $encoded = $encoding.GetBytes($content)
        $stream.Write($encoded, 0, $encoded.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
    Write-Host 'Environment initialized with independent cryptographic keys. Values are not logged.'
} finally { $rng.Dispose() }
