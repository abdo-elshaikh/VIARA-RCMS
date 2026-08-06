# 14 — Backup & Disaster Recovery Report

**Review date:** 2026-08-04  
**Scope:** Database backups, PACS backup strategies, encryption, and recovery procedures  
**Methodology:** Static review of backup scripts, backend schedule configuration, and encryption implementation  

---

## Executive Summary

RCMS includes a robust automated backup system built into the Node.js backend (`postgresBackupService.js`). It performs encrypted daily PostgreSQL backups, retains them according to configurable policies, and tracks backup status in the database. Offsite replication to S3-compatible storage is now available via the `backupOffsiteReplicator.js` service. PACS disaster recovery is supported through DICOM synchronization and storage configuration.

**Backup & DR Score: 90/100**

---

## Backup Capabilities Assessment

| Capability | Status | Evidence/Implementation |
|------------|--------|-------------------------|
| Automated schedule | ✅ | `backupScheduler.js:21-41` — `runScheduledBackup()` with advisory lock |
| Database dump | ✅ | `pg_dump` executed via Node.js child process |
| Backup encryption | ✅ | AES-256-GCM using `BACKUP_ENCRYPTION_KEY` (64-char hex enforced) |
| Backup compression | ✅ | Gzip compression applied before/during encryption |
| SHA-256 checksum | ✅ | Computed before upload, logged to audit trail |
| Offsite replication | ✅ | `backupOffsiteReplicator.js` — streams encrypted backups to S3-compatible storage via AWS CLI |
| Backup tracking | ✅ | Status, size, and checksum logged to `audit_logs` table |
| Retention policy | ✅ | Automated cleanup of old backups |
| Restore procedure | ⚠️ | Restore scripts exist but require manual execution |
| PACS backup | ⚠️ | Orthanc supports S3 plugins, but default config relies on local volume backup |

---

## Encryption & Security

Backups are encrypted using AES-256-GCM with a dedicated `BACKUP_ENCRYPTION_KEY` (enforced as a 64-character hex string in production by `validateEnv.js:53,97`). This separates backup security from live application data encryption (`ENCRYPTION_KEY`).

**Key Management Requirement:**
The `BACKUP_ENCRYPTION_KEY` MUST be securely stored in an offline password manager or HSM. If the key is lost, all encrypted backups are permanently unrecoverable.

---

## Disaster Recovery Strategies

### Scenario 1: Database Corruption / Data Loss
- **RPO (Recovery Point Objective):** 24 hours (based on daily backup schedule)
- **RTO (Recovery Time Objective):** ~1-2 hours depending on database size
- **Procedure:** 
  1. Retrieve latest encrypted backup file
  2. Decrypt using offline utility or backend script
  3. Decompress `.gz` file
  4. Restore using `pg_restore` or `psql`
  5. Restart application

### Scenario 2: PACS Volume Failure
- **RPO:** Depends on volume snapshot frequency (external to RCMS)
- **RTO:** ~4-8 hours
- **Procedure:** 
  1. Restore Orthanc storage volume from block-storage snapshots (e.g., AWS EBS snapshots)
  2. Run modality resync (`syncRegisteredModalitiesToOrthanc`)

### Scenario 3: Complete Server/Region Loss
- **RPO:** 24 hours (daily backup frequency)
- **RTO:** ~2-4 hours
- **Procedure:** With offsite replication configured (`BACKUP_OFFSITE_BUCKET`), retrieve the latest encrypted backup directly from the S3-compatible remote storage. This scenario no longer requires local volume access. Decryption and restore follow the same procedure as Scenario 1.

---

## Identified Risks & Gaps

### BDR-01: Offsite Backup Replication
- **Severity:** High
- **Status:** ✅ REMEDIATED
- **Issue:** The backup service wrote files to the local container filesystem only. If the host VM failed, backups were lost with the database.
- **Fix:** Added `backupOffsiteReplicator.js` that streams each encrypted backup to S3-compatible storage after creation. Activated automatically when `BACKUP_OFFSITE_*` environment variables are configured. Each backup is verified with a SHA-256 checksum before upload. AWS CLI is included in the backend Docker image.

### BDR-02: Restore Verification Unautomated
- **Severity:** Medium
- **Status:** ⚠️ Documented — requires external automation
- **Issue:** Backups are taken automatically, but there is no automated process to test restoration.
- **Recommendation:** Implement a weekly automated restore test script that alerts on failure.

---

## Recommendations for Production Go-Live

1. **Configure Offsite Storage:** Ensure the backup directory is mounted to resilient, remote storage.
2. **Document the Decryption Process:** Provide a standalone, tested CLI command to decrypt backups in an emergency when the main application is down.
3. **Configure PACS Backups:** Implement Orthanc S3 storage plugin or configure frequent filesystem snapshots for the PACS volume.
