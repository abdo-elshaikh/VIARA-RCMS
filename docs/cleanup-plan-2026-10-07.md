# VIARA-RCMS Project Cleanup & Reorganization Plan
## Professional File Audit — 2026-10-07

---

## Executive Summary

A comprehensive audit of the VIARA project directory identified **multiple categories of files that can be safely removed or reorganized** to improve maintainability, security, and disk space. The plan prioritizes safety — all recommendations are categorized by risk level.

---

## 1. Safe for Deletion (Low Risk)

### A. Build Artifacts — `dist/`
**Size:** ~18 zips + 16 release manifests = **~50+ files**
- `dist/client-release/viara-rcms-client-v1.0.0-*.zip` (18 files) — old release zips, keep only latest
- `dist/client-release/release-manifest-*.json` (16 files) — manifests, regenerate on build
- **Action:** Keep only `viara-rcms-client-latest.zip` and `release-manifest-latest.json`. Delete the rest.

### B. Redundant Documentation Screenshots — `docs/reviews/*/`
**Size:** 200+ PNG/JPG images
- `docs/reviews/audit-approvals-2026-10-05/*.png` (4 files) — review screenshots, already covered by MD reports
- `docs/reviews/landing-header-2026-10-06/*.png` (12 files) — landing page screenshots, redundant with MD reports
- `docs/reviews/landing-login-2026-10-06/*.png` (20 files) — login screenshots, redundant
- `docs/reviews/landing-login-improvements-2026-10-06/*.png` (30+ files) — redundant screenshots
- `docs/reviews/landing-sections-2026-10-06/*.png` (20+ files) — redundant screenshots
- `docs/reviews/reference-redesign-2026-10-06/*.png` (20+ files) — reference screenshots
- `docs/reviews/responsive-public-2026-10-06/*.png` (20+ files) — responsive screenshots
- `docs/reviews/system-readiness-2026-10-07/*.png` (6 files) — readiness screenshots
- **Action:** Delete all PNG/JPG screenshots. The MD/JSON reports contain the same information. If screenshots are needed for audit trails, archive them to a single `docs/review-screenshots/` folder with a README.

### C. Review Log/Cache Files — `docs/reviews/*/`
**Size:** 50+ JSON/log files
- `browser-results.json`, `browser-summary.json`, `browser-review.json` — review cache
- `production.json`, `validation.json` — review config outputs
- `backend.log`, `frontend.log`, `portal.log`, `worker.log` — runtime logs from reviews
- `focused-backend.log`, `focused-frontend.log`, `focused-store-env.log` — filtered logs
- `backend-coverage.log`, `backend-audit.log`, `backend-prod-audit.log` — audit logs
- `frontend-build.log`, `frontend-lint.log`, `portal-build.log`, `portal-lint.log` — build logs
- `frontend-status.json`, `frontend-results.json`, `frontend-build-status.json` — build status
- `backend-results.json`, `backend-status.json`, `backend-audit-status.json` — backend status
- `portal-results.json`, `portal-status.json`, `portal-build-status.json` — portal status
- `worker-status.json`, `worker.log` — worker status
- `database-integration.json`, `database-integration.log` — DB integration test results
- `docker-integration.json`, `docker-integration.log` — Docker integration results
- `python-audit-updated.json`, `python-advisory-details.json`, `python-advisory-details.log` — Python audit
- `readonly-api.log`, `security-repros.json` — security repro results
- `runtime.json`, `snapshot.json` — runtime snapshots
- `pre-migration-backup.json` — pre-migration backup state
- `interaction-results.json`, `results.json`, `fresh-database.json` — test results
- `final-development.json` — development state
- `backend-coverage/coverage-summary.json` — coverage data
- **Action:** Delete all review log/cache files. These are ephemeral artifacts from development/testing and are not needed in source control.

### D. Test Scripts — `docs/reviews/*/` (cjs files)
**Size:** 10+ CJS files
- `check.cjs`, `browser-review.cjs`, `probe-runtime.cjs`, `public-latency.cjs`, `security-repros.cjs`, `snapshot.cjs`, `database-readonly.cjs`, `run-check.cjs`, `readonly-api.cjs`, `production.cjs`, `preview.cjs`, `verify-browser.cjs`, `browser-details.cjs`, `capture-details.cjs`, `interaction-results.json`, `results.json`, `fresh-database.json`, `runtime.json`, `snapshot.json`
- **Action:** Delete all CJS test scripts. These are one-off verification scripts, not part of the project's test suite.

### E. Temporary Files — `scratch/`
- `scratch/demos/reap-audit.log` — single audit log file
- **Action:** Delete. Scratch files are temporary by nature.

---

## 2. Conditional Deletion (Medium Risk — Verify First)

### F. `.refact/` Directory
**Size:** 24 files (JSON, MD, LOCK files)
- `.refact/buddy/` — Kilo agent buddy memory system
- `.refact/tasks/index.json` — task tracking
- `.refact/project_information.yaml` — project metadata
- **Action:** This directory is used by the Kilo agent system. Only delete if you're not using Kilo's buddy/memory features. If you want to keep it clean, delete the briefings and chat history but keep `project_information.yaml` and `settings.json`.

### G. `keys/` Directory
**Size:** 2 files (privateKey.pem, publicKey.pem)
- **Action:** These are cryptographic keys. Do NOT delete if the application uses them for signing/encryption. Verify with `grep -r "privateKey" backend/src/` before deleting. If used, move to a secure secrets manager instead.

### H. `logs/` Directory
**Size:** 2 files (combined.log, error.log)
- **Action:** These may be actively written to by the running application. Verify they are not in use before deleting. If they are active logs, rotate them (archive to `logs/archive/`) rather than delete.

---

## 3. Reorganization Recommendations

### I. Consolidate Documentation
**Current state:** 154 MD files across `docs/` with many redundant review reports
- `docs/FINAL_PRE_RELEASE_AUDIT_AND_READINESS_REPORT_2026-10-07_AR.md` — contains false claims (identified in earlier audit)
- `docs/PRODUCTION_READINESS_ASSESSMENT_2026-10-07_AR.md` — comprehensive assessment (good)
- Multiple dated review reports (2026-10-05, 2026-10-06, 2026-10-07) — many overlap

**Action:**
1. Keep only the latest assessment: `PRODUCTION_READINESS_ASSESSMENT_2026-10-07_AR.md`
2. Archive old dated reports to `docs/archive/`
3. Rename `PERSONAL_ACCESS_TOKENS_GUIDE_AR.md` to `PERSONAL_ACCESS_TOKENS_GUIDE.md` (remove _AR suffix — it's in Arabic but the _AR suffix is inconsistent)
4. Move `PERSONAL_ACCESS_TOKENS_REVIEW_AR.md` (the developer tools review I wrote) to `docs/developer-tools-review.md`

### J. Cleanup `performance-tests/`
**Current state:** Complete performance test suite with 11 scenarios and 4 reports
- `performance-tests/reports/` — 4 report files (JSON + MD)
- `performance-tests/scenarios/` — 11 scenario files
- `performance-tests/lib/` — 4 library files
- **Action:** The reports in `reports/` are dated 2026-10-07. If they've been reviewed and incorporated into the readiness assessment, archive them. Keep the scenario and lib files.

### K. Normalize File Extensions
**Current anomalies:**
- `.env.example` vs `.env` — inconsistent naming
- `.prettierrc` vs `.prettierignore` — different tools
- `.dockerignore` — should be `.dockerignore` (current name is correct)
- `.test` files — unusual extension

**Action:**
1. Ensure `.env.example` exists (it does) and `.env` is in `.gitignore`
2. Standardize all config files to conventional extensions

---

## 4. Critical Security Items

### L. `viara-production-package/.env` Issues (from earlier review)
**Action required before production deployment:**
1. `NODE_ENV=production` — correct
2. `ALLOWED_ORIGINS` — must use HTTPS only (currently has localhost HTTP entries)
3. `CLIENT_URL` and `PORTAL_CLIENT_URL` — must use HTTPS
4. Missing required env vars: `REDIS_URL`, `METRICS_TOKEN`, `CLAMSCAN_PATH`, `WEBAUTHN_*`

### M. `keys/privateKey.pem`
**Action required:** This private key should be in a secrets manager, not in source control. Verify it's not committed to git.

---

## 5. Disk Space Recovery Estimate

| Category | Estimated Size | Files |
|----------|---------------|-------|
| dist/ old zips & manifests | ~100-200 MB | 34 files |
| docs/reviews/ screenshots | ~50-100 MB | 200+ files |
| docs/reviews/ logs & caches | ~10-20 MB | 50+ files |
| docs/reviews/ CJS scripts | ~1-2 MB | 10+ files |
| scratch/ | ~0.1 MB | 1 file |
| **Total recoverable** | **~160-320 MB** | **~300+ files** |

---

## 6. Implementation Plan

### Phase 1: Non-Destructive (Immediate)
1. Create `docs/archive/` folder
2. Move old dated reports to archive
3. Rename inconsistent files
4. Document the cleanup plan (this file)

### Phase 2: Low Risk (After Review)
1. Delete `dist/` old release artifacts (keep latest)
2. Delete `docs/reviews/*/` screenshots and CJS scripts
3. Delete `docs/reviews/*/` log/cache files
4. Clean `scratch/` directory

### Phase 3: Conditional (After Verification)
1. Review `.refact/` contents — delete if not needed
2. Verify `keys/` usage — move to secrets manager if needed
3. Rotate `logs/` if active

---

## 7. File Preservation Checklist

Before deleting anything, verify these essential files are NOT affected:

- [x] `backend/src/` — Core backend code (149 test suites)
- [x] `frontend/src/` — Core frontend code (126 test files)
- [x] `database/migrations/` — 194 migration files (essential)
- [x] `docs/PRODUCTION_READINESS_ASSESSMENT_2026-10-07_AR.md` — Latest assessment
- [x] `docs/PERSONAL_ACCESS_TOKENS_GUIDE_AR.md` — Token guide (newly created)
- [x] `package.json` — Project configuration
- [x] `docker-compose.yml` — Docker orchestration
- [x] `.env.example` — Environment template
- [x] `README.md` — Project documentation

---

## 8. Post-Cleanup Structure

```
VIARA/
├── backend/              # Core backend (keep)
├── frontend/             # Core frontend (keep)
├── database/             # Schema & migrations (keep)
├── docs/
│   ├── archive/          # Old dated reports (moved here)
│   ├── reports/          # System readiness reports (keep)
│   ├── reviews/          # Review artifacts (CLEANUP)
│   │   └── ...           # Only keep essential review outputs
│   ├── PRODUCTION_READINESS_ASSESSMENT_2026-10-07_AR.md
│   ├── PERSONAL_ACCESS_TOKENS_GUIDE.md  (renamed)
│   ├── developer-tools-review.md        (new)
│   └── README.md           # Add index of docs
├── performance-tests/    # Test suite (keep scenarios/lib, archive reports)
├── dist/                 # Build artifacts (CLEANUP old releases)
├── keys/                 # Cryptographic keys (VERIFY usage)
├── logs/                 # Application logs (VERIFY active)
├── scratch/              # Temporary files (CLEANUP)
├── .refact/              # Kilo agent system (CONDITIONAL)
├── viara-production-package/  # Production package (review env file)
├── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 9. Next Steps

1. **Review this plan** and confirm which categories to proceed with
2. **Backup** the project before any deletions (git commit or zip)
3. **Execute Phase 1** (non-destructive reorganization)
4. **Verify** the application still works after Phase 1
5. **Execute Phase 2** (low-risk deletions)
6. **Execute Phase 3** (conditional cleanup)

---

*Cleanup plan created by Kilo on 2026-10-07*
*Based on comprehensive file audit of VIARA-RCMS v1.0.0*
