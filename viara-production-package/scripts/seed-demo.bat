@echo off
cd /d "%~dp0\.."
if not "%VIARA_ALLOW_DESTRUCTIVE_DEMO_SEED%"=="I_UNDERSTAND_THIS_TRUNCATES_DATA" (
    echo [REFUSED] Demo seeding truncates customer tables.
    echo Use only on a disposable evaluation database after explicit approval.
    exit /b 1
)
if "%TEST_USER_PASSWORD%"=="" (
    echo [ERROR] Set TEST_USER_PASSWORD in the calling shell. It will not be read from or written to .env.
    exit /b 1
)
echo [INFO] Seeding the explicitly approved disposable evaluation database...
docker compose exec -e TEST_USER_PASSWORD backend node seed.js
if errorlevel 1 exit /b 1
