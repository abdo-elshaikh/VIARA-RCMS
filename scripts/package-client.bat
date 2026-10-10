@echo off
setlocal
cd /d "%~dp0\.."
echo [INFO] Packaging VIARA-RCMS Client Release...
node scripts/package-client-release.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Packaging failed.
    exit /b %ERRORLEVEL%
)
