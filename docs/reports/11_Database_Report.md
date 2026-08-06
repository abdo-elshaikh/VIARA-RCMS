# 11 — Database Report

**Review date:** 2026-08-04  
**Scope:** PostgreSQL schema, 105 migrations, constraints, indexes, and data integrity  
**Methodology:** Static review of `schema.sql`, `migrations/`, `migrate.js`, and backend query patterns  

---

## Executive Summary

The RCMS database is a well-designed PostgreSQL 15 schema with **40+ tables**, **105 sequential migrations**, proper constraint enforcement (FK, CHECK, EXCLUDE, UNIQUE), and comprehensive indexing. The migration runner uses advisory locking, SHA-256 checksums for idempotency, and supports `--fresh` re-creation. Financial integrity is enforced through database-level constraints and journal entry patterns.

**Database Health Score: 85/100**

---

## Schema Design Assessment

### Key Tables & Relationships

| Table Group | Tables | Key Features |
|-------------|--------|-------------|
| Users & Auth | `users`, `refresh_tokens`, `api_tokens` | UUID PKs, bcrypt hashes, single-owner constraint |
| Patients | `patients` | Field-level encryption, blind index hashes, status enum |
| Clinical | `appointments`, `examinations`, `report_templates` | GIST exclusion, queue stages, multi-stage reports |
| Billing | `invoices`, `payments`, `cashier_shifts` | Payment status enum, journal entries, shift governance |
| Insurance | `insurance_contracts`, `claims`, `claim_status_history` | Contract integrity constraints, audit history |
| PACS | `pacs_*`, `dicom_*`, `ai_report_drafts` | Study UID, reconciliation queue, quarantine |
| Privacy | `data_privacy_requests`, `privacy_export_artifacts`, `patient_consents` | Expiring exports, consent management |
| HR | `payroll_*`, `hr_*` | Approval workflow, finance posting |
| Audit | `audit_logs`, `security_events` | Tamper-evident hash chain, structured events |
| Settings | `center_settings`, `system_settings` | Single-row singleton pattern |

### Data Types

- ✅ UUID primary keys throughout (`uuid_generate_v4()`)
- ✅ `TIMESTAMP WITH TIME ZONE` for all timestamps
- ✅ `DECIMAL(10,2)` for financial amounts
- ✅ `JSONB` for flexible schema fields (maintenance_schedule, report_sections)
- ✅ Appropriate VARCHAR lengths for each field

---

## Constraint Analysis

### CHECK Constraints

| Table | Constraint | Purpose |
|-------|-----------|---------|
| `patients` | `patient_status IN (...)` | Valid patient states |
| `appointments` | `pregnancy_safety_status IN (...)` | Safety enum enforcement |
| `examinations` | `queue_stage IN (...)`, `current_station IN (...)` | Workflow state machine |
| `modalities` | `port > 0 AND port <= 65535` | Network port validation |
| `examination_types` | `price >= 0`, `duration_minutes BETWEEN 1 AND 1440` | Business rule enforcement |
| `center_settings` | `setting_id = 1` | Singleton row pattern |
| `refresh_tokens` | `num_nonnulls(user_id, patient_id, doctor_id) = 1` | Single-owner enforcement |
| `api_tokens` | `access_level IN ('read', 'read_write')` | Token scope validation |

### EXCLUDE Constraints

| Table | Constraint | Purpose |
|-------|-----------|---------|
| `appointments` | `EXCLUDE USING GIST (modality_id WITH =, tstzrange WITH &&)` | Prevent double-booking |

### Foreign Keys

All inter-table relationships use proper FK constraints with appropriate `ON DELETE` actions:
- `CASCADE` for dependent data (e.g., `privacy_export_artifacts` → `data_privacy_requests`)
- `SET NULL` for optional references (e.g., `uploaded_by`, `assigned_manager_id`)
- `RESTRICT` for integrity-critical references (e.g., `prior_exam_id`)

---

## Index Analysis

| Category | Count | Examples |
|----------|-------|---------|
| Primary Key indexes | 40+ | Automatic via `PRIMARY KEY` |
| Lookup indexes | 30+ | `idx_users_email`, `idx_patients_mrn` |
| Hash-based search indexes | 7 | `idx_patients_national_id_hash`, `phone_hash`, etc. |
| Performance indexes | 10+ | Migrations 100, 104 |
| Partial indexes | 5+ | `idx_documents_patient WHERE is_deleted = FALSE` |
| Composite indexes | 5+ | `idx_examination_types_active_modality` |
| Unique indexes | 3+ | `idx_examination_types_code_unique ON UPPER(code)` |

---

## Migration System

### Runner (`migrate.js`)

| Feature | Implementation | Status |
|---------|---------------|--------|
| Tracking table | `applied_migrations` | ✅ |
| Advisory locking | `pg_advisory_lock(8675309)` | ✅ |
| SHA-256 checksums | Verified on re-apply | ✅ |
| `--fresh` mode | Drop and recreate schema | ✅ |
| `--seed` mode | Apply seed data | ✅ |
| `--dry-run` mode | Preview without applying | ✅ |
| Transaction per migration | ✅ | ✅ |
| Idempotent operations | `IF NOT EXISTS`, `ON CONFLICT DO NOTHING` | ✅ |

### Migration Count: 105 files (001 through 110)

**Ordering issue:** Some higher-numbered migrations (100-107) appear early in the execution order because they were added as hotfixes. This is handled correctly by the explicit ordering array in `migrate.js:21-127`.

---

## Concurrency Safety

| Pattern | Usage | Evidence |
|---------|-------|---------|
| `SELECT FOR UPDATE` | Invoice payment collection | `invoiceController.js` |
| Advisory locks | Migration runner | `migrate.js` |
| Idempotency keys | Appointments, expenses | Migrations 109, 110 |
| GIST exclusion | Appointment overlap | `schema.sql:204-208` |
| Transactions | Refresh token rotation, payments | Multiple controllers |

---

## Financial Integrity

| Control | Evidence |
|---------|----------|
| Journal entries with double-entry accounting | Migration 066, 068 |
| Invoice item total reconciliation | Migration 069 |
| Financial integrity constraints | Migration 067 |
| Payment governance | Migration 048 |
| Partial payment exceptions | Migration 091 |

---

## Extensions

| Extension | Purpose |
|-----------|---------|
| `uuid-ossp` | UUID generation |
| `btree_gist` | GIST index support for exclusion constraints |
| `pg_trgm` | Trigram text search |

---

## Recommendations

1. **Add `updated_at` trigger** — currently relies on application-layer updates
2. **Consider row-level security** for multi-tenancy if needed in future
3. **Add table partitioning** for `audit_logs` and `notification_logs` if they grow large
4. **Monitor long-running queries** via `pg_stat_statements`
5. **Verify index usage** with `pg_stat_user_indexes` on production data
