param([int]$TimeoutSeconds = 300)

$ErrorActionPreference = 'Stop'
$services = @('postgres', 'clamav', 'orthanc', 'backend', 'frontend', 'portal', 'ohif')
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)

do {
    $unhealthy = @()
    foreach ($service in $services) {
        try {
            $result = docker compose ps --format json $service 2>$null
            if ($LASTEXITCODE -ne 0 -or -not $result) { throw 'Status unavailable' }
            $status = @($result | ConvertFrom-Json)
            if ($status.Count -ne 1 -or $status[0].State -ne 'running' -or $status[0].Health -ne 'healthy') {
                $unhealthy += $service
            }
        } catch { $unhealthy += $service }
    }
    if ($unhealthy.Count -eq 0) {
        Write-Host 'All required VIARA services are healthy.'
        exit 0
    }
    if ([DateTime]::UtcNow -ge $deadline) {
        Write-Host "ERROR: Services did not become healthy: $($unhealthy -join ', ')"
        exit 1
    }
    Write-Host "Waiting for healthy services: $($unhealthy -join ', ')"
    Start-Sleep -Seconds 5
} while ($true)
