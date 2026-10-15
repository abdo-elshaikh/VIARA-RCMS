param(
    [string]$HostAddress = "127.0.0.1",
    [int]$Port = 3015,
    [switch]$PreloadModel
)

$ErrorActionPreference = "Stop"
$rootEnvPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) ".env"

if (-not (Test-Path -LiteralPath $rootEnvPath)) {
    throw "VIARA root .env was not found at $rootEnvPath"
}

foreach ($line in Get-Content -LiteralPath $rootEnvPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
        continue
    }

    $name, $value = $trimmed.Split("=", 2)
    $value = $value.Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($name.Trim(), $value, "Process")
}

if ([string]::IsNullOrWhiteSpace($env:PACS_AI_WORKER_API_KEY) -or $env:PACS_AI_WORKER_API_KEY.Length -lt 24) {
    throw "PACS_AI_WORKER_API_KEY must be configured with at least 24 characters."
}

$env:ORTHANC_URL = "http://127.0.0.1:8042"
$env:MODEL_BACKEND = if ($env:PACS_AI_MODEL_BACKEND) { $env:PACS_AI_MODEL_BACKEND } else { "torchxrayvision" }
$env:MODEL_ID = if ($env:PACS_AI_MODEL_ID) { $env:PACS_AI_MODEL_ID } else { "densenet121-res224-all" }
$env:ALLOW_CPU_INFERENCE = "true"
$env:PRELOAD_MODEL = if ($PreloadModel) { "true" } else { $env:PACS_AI_PRELOAD_MODEL }
$env:XRV_FINDING_THRESHOLD = if ($env:PACS_AI_XRV_FINDING_THRESHOLD) { $env:PACS_AI_XRV_FINDING_THRESHOLD } else { "0.65" }
$env:PYTHONIOENCODING = "utf-8"

Set-Location -LiteralPath $PSScriptRoot
python -m uvicorn app.main:app --host $HostAddress --port $Port --workers 1
