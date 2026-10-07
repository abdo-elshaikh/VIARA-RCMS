# Production Backup Restore Runbook — VIARA

**Scope:** restoring an encrypted PostgreSQL dump (production `BACKUP_MODE=postgres`)
into a running or rebuilt deployment. The API's restore endpoint intentionally
refuses dump restores and points here — restoring a full database is a
maintenance-window operation, not an in-app action.

**Practice this runbook on a scratch environment at least once per quarter. An
untested restore path is equivalent to having no backups.**

---

## 0. When to use this runbook

- Host/volume failure where the database was lost but backups survived
- Corrupt database (bad migration, accidental `TRUNCATE`, ransomware)
- Standing up a staging environment from production data
- Scheduled restore drill

**RPO reality check:** the scheduler produces one dump per day (default 02:00
UTC). Everything since the last successful dump is lost. Orthanc DICOM files
are NOT covered by these dumps — see §6.

---

## 1. Preconditions

| Item | Check |
|---|---|
| Latest artifact | `backend/backups/VIARA_backup_*.dump.enc` (or offsite S3 bucket if `BACKUP_OFFSITE_*` configured) |
| `BACKUP_ENCRYPTION_KEY` | Available from the deployment's secret store (compose requires it via `:?`) |
| `DATABASE_URL` credentials | Of the **target** database you will restore into |
| Maintenance window | Announced; backend stopped or pointed elsewhere |
| Disk space | Free space ≥ 3× the decrypted dump size |

> ⚠️ Never restore into the live database without taking a safety snapshot of
> the current state first (§2). If the current DB is unreadable, skip to §3.

---

## 2. Safety snapshot of the current database (if still readable)

```powershell
# Inside the backend container or anywhere with psql access
$env:PGPASSWORD = '<db-password>'
pg_dump --format=custom --no-owner --no-privileges `
  --file "pre_restore_$(Get-Date -Format yyyyMMdd_HHmmss).dump" `
  --dbname "$env:DATABASE_URL"
```

Encrypt and move it into the backup directory following §4 in reverse, or at
minimum store it outside the database volume.

---

## 3. Decrypt the backup artifact

The `VIARABKP2` magic header means AES-256-GCM with a random IV and auth tag.

```powershell
cd backend
$env:BACKUP_ENCRYPTION_KEY = '<key-from-secret-store>'
node scripts/decryptBackup.js <backups/VIARA_backup_YYYYMMDD_HHMMSS.dump.enc> <pre-restore.decrypt.dump>
```

The script verifies the magic header, size, and GCM auth tag before writing —
a tampered or truncated file fails loudly. If it fails, try the previous day's
artifact and check offsite replication.

**Verify integrity of the decrypted dump:**

```powershell
pg_restore --list pre-restore.decrypt.dump | Select-Object -First 20
```

You should see TOC entries for all core tables (`patients`, `appointments`,
`examinations`, `invoices`, `payments`, `system_logs`, ...). Note the number of
entries — you will compare after restore.

---

## 4. Automated One-Command Restore (Recommended)

In production package or docker deployments, use the unified restore runner:

### Linux / Docker Host:
```bash
# List available backup archives
./scripts/restore.sh --list

# Verify backup and PACS integrity without modifying database (Dry-Run)
./scripts/restore.sh VIARA_pg_20261005_uuid.dump.enc --verify-only

# Execute full automated restore (PostgreSQL + Orthanc PACS)
./scripts/restore.sh VIARA_pg_20261005_uuid.dump.enc --confirm
```

### Windows Host:
```bat
REM List available backups
scripts\restore.bat --list

REM Verify backup without modifying database (Dry-Run)
scripts\restore.bat VIARA_pg_20261005_uuid.dump.enc --verify-only

REM Execute full automated restore (PostgreSQL + Orthanc PACS)
scripts\restore.bat VIARA_pg_20261005_uuid.dump.enc --confirm
```

The script automatically:
1. Validates the filename and checks AES-256-GCM authentication tags.
2. Decrypts to a transient in-memory/restricted temporary file.
3. Tests dump table TOC via `pg_restore --list`.
4. Decrypts companion PACS archive (`.pacs.zip.enc`), verifies SHA-256 hashes against `manifest.json`.
5. Executes `pg_restore` against the database container with `--clean --if-exists --no-owner --no-privileges`.
6. Restores all DICOM instances to Orthanc via authenticated REST API.
7. Automatically cleans up all temporary decrypted files in `finally` blocks.

---

## 5. Manual CLI Step-by-Step Restore (Alternative)

### Option A — Direct Node Runner
```bash
# Inside backend container or backend folder:
node scripts/restorePostgresBackup.js --file=VIARA_pg_20261005_uuid.dump.enc --confirm
```

### Option B — Raw pg_restore
```bash
# 1. Decrypt dump
node scripts/decryptBackup.js backups/VIARA_pg_20261005_uuid.dump.enc /tmp/restore.dump

# 2. Terminate active sessions & restore
psql -U viara -d viara -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='viara' AND pid <> pg_backend_pid();"
pg_restore -U viara -d viara --clean --if-exists --no-owner --no-privileges /tmp/restore.dump

# 3. Restore PACS companion (if exists)
node scripts/restorePacsBackup.js --file=backups/VIARA_pg_20261005_uuid.pacs.zip.enc --target=http://orthanc:8042

# 4. Remove unencrypted temporary dump
rm -f /tmp/restore.dump
```

---

## 6. Post-restore verification (mandatory)

```powershell
# Core row counts — compare with pre-incident expectations / audit trail
docker exec <VIARA_db container> psql -U VIARA -d VIARA -c "
  SELECT 'patients' t, COUNT(*) FROM patients
  UNION ALL SELECT 'appointments', COUNT(*) FROM appointments
  UNION ALL SELECT 'examinations', COUNT(*) FROM examinations
  UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
  UNION ALL SELECT 'payments', COUNT(*) FROM payments
  UNION ALL SELECT 'system_logs', COUNT(*) FROM system_logs;"

# Schema migrations table must show the full applied chain
docker exec <VIARA_db container> psql -U VIARA -d VIARA -c "
  SELECT COUNT(*) AS applied_migrations FROM schema_migrations;"

# Audit chain integrity must hold across the restored history
docker exec <VIARA_db container> psql -U VIARA -d VIARA -c "
  SELECT COUNT(*) FROM system_logs WHERE prev_hash IS NOT NULL AND is_valid = FALSE;"
```

Then start the backend and smoke-test: login, patient search (blind indexes),
patient detail (field decryption), invoice list, audit log page, and PACS study viewer.

---

## 7. Known Architectural Invariants

1. **Integrated PACS Companion:** `createPostgresBackup` automatically bundles a `.pacs.zip.enc` companion containing all Orthanc DICOM instances verified against a SHA-256 manifest. Restoring with `./scripts/restore.sh --confirm` restores both database state and DICOM imagery in lockstep.
2. **Authenticated Encryption:** All backups use AES-256-GCM (`VIARABKP2` header) with 96-bit random IVs and 128-bit authentication tags. Tampered dumps fail immediately at decryption time before touching the database.
3. **Encryption Keys:** If patient names or encrypted fields render encrypted or searches fail after restore, ensure the `ENCRYPTION_KEY` and `BLIND_INDEX_KEY` in the target `.env` match the production secrets at the time of backup creation (see `docs/runbooks/KEY_ROTATION.md`).
4. **Maintenance Window:** In-app `/api/backups/restore` intentionally blocks PostgreSQL `.dump` and `.dump.enc` restores to prevent connection drops and race conditions during production operations.

---

*Related: `docs/DISASTER_RECOVERY_RUNBOOK_AR.md`, `viara-production-package/scripts/restore.sh`, `backend/scripts/restorePostgresBackup.js`, `backend/src/services/postgresBackupService.js`.*
