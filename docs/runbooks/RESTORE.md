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

## 4. Restore into the target database

### Option A — Docker deployment (recommended)

```powershell
# Copy the decrypted dump into the postgres container
docker cp pre-restore.decrypt.dump <VIARA_db container>:/tmp/restore.dump

# Drop existing connections, then restore.
# WARNING: --clean drops database objects before recreating them.
docker exec -it <VIARA_db container> psql -U VIARA -d VIARA `
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='VIARA' AND pid <> pg_backend_pid();"

docker exec -it <VIARA_db container> pg_restore `
  --username VIARA --dbname VIARA `
  --clean --if-exists --no-owner --no-privileges `
  --jobs 4 /tmp/restore.dump
```

### Option B — Host psql

```powershell
$env:PGPASSWORD = '<db-password>'
pg_restore --clean --if-exists --no-owner --no-privileges --jobs 4 `
  --dbname "$env:DATABASE_URL" pre-restore.decrypt.dump
```

`pg_restore` exit code 0 = success. Non-zero with `--jobs` can still be a
partial success — check §5 counts, and re-run without `--jobs` if unsure.

---

## 5. Post-restore verification (mandatory)

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
# (in-app: Admin → Audit → "Verify integrity", or:)
docker exec <VIARA_db container> psql -U VIARA -d VIARA -c "
  SELECT COUNT(*) FROM system_logs WHERE prev_hash IS NOT NULL AND is_valid = FALSE;"
```

Then start the backend and smoke-test: login, patient search (blind indexes),
patient detail (field decryption), invoice list, audit log page.

> If patient names render as garbage or searches return nothing, the
> `ENCRYPTION_KEY`/`BLIND_INDEX_KEY` in the target `.env` do not match the keys
> that were live when the backup was taken. Obtain the correct keys from the
> secret store (this is exactly why key rotation must follow
> `docs/runbooks/KEY_ROTATION.md`).

---

## 6. Known gaps — do not discover these during an incident

1. **Orthanc DICOM storage is not in these backups.** `pg_dump` covers the RIS
   database only. The `orthanc_storage` volume (all images) must be restored
   from volume snapshots / object storage separately, and the Orthanc index
   (currently SQLite inside the same volume) comes back with it.
2. **No stored checksum.** The dump's SHA-256 is logged at creation time but
   not persisted as a sidecar; §3's `pg_restore --list` + GCM tag is the
   practical integrity check today.
3. **RTO estimate (~1–2h)** assumes artifacts are on-host. If offsite S3
   replication is configured, add download time for the artifact size.

---

## 7. Restore drill (quarterly, staging only)

1. Create a scratch database (`VIARA_drill`).
2. Take yesterday's encrypted artifact and run §3–§5 against the scratch DB.
3. Record elapsed time (this is your real RTO), any errors, and row-count
   deltas; file issues for anything that was not one command.
4. Drop the scratch database and delete the decrypted dump immediately —
   decrypted artifacts contain PHI.

---

*Related: `docs/runbooks/KEY_ROTATION.md` (key rotation before/after restore),
`backend/scripts/decryptBackup.js` (decrypt tool),
`backend/src/services/postgresBackupService.js` (backup creation).*
