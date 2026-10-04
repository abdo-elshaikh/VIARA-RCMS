@echo off
REM =============================================================================
REM VIARA RCMS — Windows helper for a supported Linux Docker host
REM =============================================================================
title VIARA RCMS Launcher
cd /d "%~dp0\.."

echo ======================================================================
echo           VIARA Radiology Information and PACS System              
echo ======================================================================

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not in PATH.
    echo Configure Docker Compose to target the supported Linux host or VM.
    pause
    exit /b 1
)

set "DOCKER_OS="
for /f "delims=" %%i in ('docker info --format "{{.OSType}}" 2^>nul') do set "DOCKER_OS=%%i"
if /i not "%DOCKER_OS%"=="linux" (
    echo [ERROR] VIARA release containers require a reachable Linux Docker Engine.
    echo Run this launcher from the supported Linux VM, or configure a compatible local Linux engine.
    pause
    exit /b 1
)

if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Copying .env.example to .env...
        copy .env.example .env
    ) else (
        echo [ERROR] .env file is missing.
        pause
        exit /b 1
    )
)

docker compose config --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Compose configuration is incomplete. Check .env and the vendor-issued pinned image references.
    pause
    exit /b 1
)

powershell -NoProfile -Command "$images = docker compose config --images; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; $invalid = $images | Where-Object { $_ -notmatch '@sha256:[0-9a-fA-F]{64}$' }; if ($invalid) { Write-Error 'Every service image must use its vendor-approved sha256 digest.'; exit 1 }"
if %errorlevel% neq 0 (
    echo [ERROR] Image references must be immutable sha256 digests.
    pause
    exit /b 1
)

echo [INFO] Launching containers via docker compose...
docker compose up -d
if %errorlevel% neq 0 (
    echo [ERROR] VIARA services failed to start. Review the Compose output and release configuration.
    pause
    exit /b 1
)

echo [INFO] Waiting for required services to become healthy...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wait-healthy.ps1"
if %errorlevel% neq 0 (
    echo [ERROR] VIARA readiness checks failed. Review docker compose ps and service logs.
    pause
    exit /b 1
)
echo.
echo ======================================================================
echo            VIARA required services are healthy.
echo ======================================================================
echo Check service health with: docker compose ps
echo Use customer-approved HTTPS URLs through the configured reverse proxy.
echo Published application ports are bound to host loopback.
echo DICOM Storage:    see PACS_DICOM_BIND / PACS_DICOM_PORT / ORTHANC_AET in .env
echo Orthanc API health is checked; validate device transfer and diagnostic workflows separately.
echo.
echo Obtain initial administrator access through the approved secure onboarding procedure.
echo ======================================================================
pause
