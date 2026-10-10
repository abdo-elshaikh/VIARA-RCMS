@echo off
cd /d "%~dp0\.."
echo [INFO] Stopping VIARA containers...
docker compose down
echo [INFO] VIARA stack stopped successfully.
pause
