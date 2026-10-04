@echo off
setlocal
cd /d "%~dp0\.."

if "%~1"=="" goto list_backups
if "%~1"=="--list" goto list_backups
if "%~1"=="-l" goto list_backups

echo ========================================================
echo   VIARA-RCMS Disaster Recovery ^& Restore
echo ========================================================
echo Target Backup: %~1
echo.

docker compose exec -T backend node scripts/restorePostgresBackup.js --file="%~1" %2 %3 %4 %5
goto end

:list_backups
echo ========================================================
echo   VIARA-RCMS Available Backups
echo ========================================================
docker compose exec -T backend node scripts/restorePostgresBackup.js --list
echo.
echo Usage:
echo   restore.bat ^<BACKUP_FILENAME^> [--confirm] [--verify-only] [--skip-pacs]
echo.
echo Example (dry-run verify only):
echo   restore.bat VIARA_pg_...dump.enc --verify-only
echo.
echo Example (production restore):
echo   restore.bat VIARA_pg_...dump.enc --confirm
echo.

:end
