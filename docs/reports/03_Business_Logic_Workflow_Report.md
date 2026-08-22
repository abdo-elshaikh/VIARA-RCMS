# 03 — Business Logic & Workflow Report

**Review date:** 2026-08-04  
**Scope:** All VIARA business workflows, state transitions, and business rules  
**Methodology:** Static analysis of controllers, services, database constraints, and schema  

---

## Executive Summary

VIARA implements **20+ discrete business workflows** with well-defined state machines, database-enforced constraints, and role-based access control. The most critical workflows (authentication, payment, clinical queue, reporting) demonstrate mature implementation with proper validation, audit logging, and failure handling. Two workflow defects exist in the cashier subsystem (frontend-only).

---

## Workflow Analysis

### 1. Authentication Workflow

```
Login Request → Validate Credentials → Check Lockout → Verify Password
  → [2FA Enabled] → Issue Temp Token → Verify TOTP → Issue Tokens
  → [2FA Disabled] → Issue Access + Refresh Tokens → Set Cookie
  → [Failed] → Increment Attempts → [≥5] → Lock 15 min
```

**Findings:**
- ✅ Progressive lockout: 5 attempts → 15-minute lock (`authController.js:109-113`)
- ✅ Failed attempts reset on success (`authController.js:141-143`)
- ✅ Security events logged for all outcomes
- ✅ Refresh token rotation with transaction and `FOR UPDATE` semantics
- ✅ Session metadata captured (IP, User-Agent)
- ✅ Permissions fetched with `bypassCache=true` on login (`authController.js:178`)

### 2. Patient Registration Workflow

```
Receive Data → Validate (Zod Schema) → Encrypt PII → Generate Blind Index Hashes
  → Check Duplicates (hash-based) → Insert Patient → Audit Log
```

**Findings:**
- ✅ PII encryption via AES-256-GCM (`crypto.js`)
- ✅ Blind index hashing for searchable encrypted fields
- ✅ Duplicate detection on national_id_hash, passport_number_hash, name_dob_hash
- ✅ `patient_status` enum with proper state machine: Active → Inactive → Deceased → Merged → Restricted → Anonymized

### 3. Appointment Scheduling Workflow

```
Create Request → Validate Times → Check Modality Availability
  → [Conflict] → Reject with details
  → [Available] → Insert with Exclusion Constraint → Create Examination → Audit Log
```

**Findings:**
- ✅ PostgreSQL GIST exclusion constraint prevents overlapping appointments (`schema.sql:204-208`)
- ✅ Follow-up linkage with constraint: `is_follow_up = TRUE` requires `prior_exam_id` (`schema.sql:298-300`)
- ✅ Safety status tracking (pregnancy, implant, renal) on both appointments and examinations
- ✅ Cancellation tracking with reason, cancelled_by, and timestamp

### 4. Clinical Queue Workflow

```
Registered → Scheduled → Arrived → Payment Pending → Prep Pending
  → Ready for Exam → In Exam → Reporting → Finalized → Delivered
```

**Station tracking:** Reception → Cashier → Nurse → Modality → Radiologist → Delivery

**Findings:**
- ✅ `queue_stage` enum enforces valid states (`schema.sql:236`)
- ✅ `current_station` enum tracks physical location (`schema.sql:237`)
- ✅ Timestamp tracking for each stage transition (arrived_at, prep_started_at, etc.)
- ✅ Hold/release mechanism with reason tracking

### 5. Report Writing & Approval Workflow

```
Draft → Typed → Reviewed → Approved → Finalized
  → [Amendment] → Amended (with reason) → Re-approval
```

**Findings:**
- ✅ Multi-stage approval with separate reviewed_by and approved_by
- ✅ Digital signature with name, role, and hash
- ✅ Report locking after finalization
- ✅ Amendment tracking with reason and timestamp
- ✅ Template system with versioning and modality-specific templates
- ✅ AI draft assistance with structured sections

### 6. Payment & Billing Workflow

```
Invoice Created → Payment Collected → [Partial] → Track Balance
  → [Full] → Mark Paid → [Refund Requested] → Review → Approve → Execute
```

**Findings:**
- ✅ Invoice-level `FOR UPDATE` locking prevents race conditions (`invoiceController.js`)
- ✅ Payment status enum: Pending → Paid → Refunded → Partial
- ✅ Refund workflow separated into request → review → approval stages
- ✅ Financial journal entries with double-entry accounting
- ✅ Cashier shift gating (payment requires open shift)
- ⚠️ **Frontend reconciliation: REMEDIATED (UX-01)** — now calls `closeCashierShift` mutation via `onReconcile`, awaits result, and only shows success after server confirmation.

### 7. Cashier Shift Workflow

```
Open Shift → Collect Payments → [End of Day] → Close Shift → Reconcile Drawer
```

**Findings:**
- ✅ Shift open/close tracking in database
- ✅ `Active` status recognized by `useShiftFlow.js` (REMEDIATED — UX-02)
- ✅ Zero-cash reconciliation accepted (REMEDIATED — UX-03)

### 8. Insurance Claims Workflow

```
Claim Created → Submitted → Under Review → [Approved/Rejected/Partial]
  → Payment Applied → Settled → [Written Off]
```

**Findings:**
- ✅ Claims status history table for audit trail
- ✅ Insurance contract integrity constraints (migration 082)
- ✅ Coverage rules and approval workflow

### 9. PACS/DICOM Workflow

```
Study Received (Orthanc) → Webhook → Enqueue Reconciliation
  → Match to Examination → Update Study UID → [AI Enabled] → Queue Analysis
  → AI Worker → Store Results
```

**Findings:**
- ✅ Asynchronous reconciliation via PostgreSQL job queue (`pacsReconciliationQueue.js`)
- ✅ Webhook signature verification (`PACS_WEBHOOK_SECRET`)
- ✅ Rate limiting on webhook endpoint
- ✅ AI analysis with configurable provider and model
- ✅ MWL generation for modality integration

### 10. Privacy & Data Protection Workflow

```
Privacy Request → Review → [Export/Erasure/Restriction]
  → Execute → Generate Artifact → Audit → Expire Downloads
```

**Findings:**
- ✅ Data privacy request lifecycle with proper states
- ✅ Export artifact with checksum, expiry, and download counting
- ✅ Data retention policies table
- ✅ Patient consent management

---

## Business Rule Verification

| Rule | Implementation | Verified |
|------|---------------|----------|
| No overlapping appointments per modality | PostgreSQL EXCLUDE constraint | ✅ |
| Follow-up requires prior exam link | CHECK constraint on `is_follow_up` | ✅ |
| Refresh token single-owner | CHECK constraint: `num_nonnulls(user_id, patient_id, doctor_id) = 1` | ✅ |
| Center settings singleton | CHECK constraint: `setting_id = 1` | ✅ |
| Exam type prices non-negative | CHECK constraint: `price >= 0` | ✅ |
| Duration within bounds | CHECK constraint: `duration_minutes BETWEEN 1 AND 1440` | ✅ |
| Port range valid | CHECK constraint: `port > 0 AND port <= 65535` | ✅ |
| Payment must have open cashier shift | Enforced in cashierController | ✅ |
| Refund requires separate approval | Split permissions (migration 046) | ✅ |
| Result delivery requires full payment | Enforced in migration 092 | ✅ |

---

## Logic Gaps & Recommendations

1. ✅ **Cashier reconciliation** — **REMEDIATED.** Frontend now calls `closeCashierShift` mutation via `onReconcile`, awaits `.unwrap()`, preserves form data on failure, and invalidates shift data after success.
2. ✅ **Concurrent invoice updates** — Already addressed with `FOR UPDATE` — verified.
3. ✅ **Appointment idempotency** — Idempotency keys added (migration 109) — verified.
4. ✅ **Expense idempotency** — Idempotency keys added (migration 110) — verified.
5. ⏳ **Mobile table responsiveness** — UX-16 requires device testing.
6. ⏳ **SSE connection feedback** — UX-19 planned for P3.
