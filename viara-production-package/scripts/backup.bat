@echo off
setlocal
cd /d "%~dp0\.."

echo [INFO] Creating and verifying an encrypted PostgreSQL backup...
docker compose exec -T backend node -e "require('./src/services/postgresBackupService').createPostgresBackup().then(backup => console.log('[SUCCESS] Backup created: ' + backup.filename)).catch(error => { console.error('[ERROR] ' + error.message); process.exitCode = 1; })"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Backup failed.
    exit /b %ERRORLEVEL%
)

echo [INFO] Backup operation completed.
