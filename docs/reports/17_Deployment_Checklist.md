# 17 — Deployment Checklist

**Review date:** 2026-08-04  
**Target Environment:** Production  

---

## 1. Pre-Deployment (Code & Artifacts)

- [x] ✅ **Critical Fixes Applied:** UX-01 (Cashier Reconciliation) fixed and validated — frontend now calls `closeCashierShift` mutation.
- [x] ✅ **Secrets Generated:** Generate cryptographically secure random 64-char hex strings for `ENCRYPTION_KEY` and `BACKUP_ENCRYPTION_KEY`.
- [x] ✅ **Passwords Generated:** Generate secure random strings for `JWT_SECRET`, `ORTHANC_PASSWORD`, `PACS_WEBHOOK_SECRET`, `BLIND_INDEX_KEY`.
- [x] ✅ **Nginx Parameterization:** `VITE_OHIF_URL` is parameterized via `nginx.conf.template`.
- [x] ✅ **CI YAML Validated:** `.github/workflows/quality-gates.yml` syntax corrected (SEC-04 remediated).
- [x] ✅ **Docker Images Built:** Verify CI pipeline has successfully built and tagged production images.
- [x] ✅ **Vulnerability Scans Passed:** Confirm Trivy scans show 0 HIGH/CRITICAL vulnerabilities.
- [x] ✅ **Backend Tests:** 227/227 PASS across 37 suites.
- [x] ✅ **Frontend Validation:** Lint PASS (0 warnings), Tests PASS (136/136 across 41 test files).

## 2. Infrastructure Setup

- [ ] **Host Provisioning:** VM/Server provisioned with sufficient CPU/Memory (minimum 4 vCPU, 16GB RAM recommended).
- [x] ✅ **Resource Limits:** Verify `docker-compose.yml` includes `mem_limit` and `cpus` for all services (INFRA-01 remediated).
- [ ] **Storage Attached:** Persistent volumes attached for Database (`postgres-data`), PACS (`orthanc-storage`), and Backups (`/app/backups`).
- [ ] **Backup Offsite Replication:** Configure `BACKUP_OFFSITE_*` environment variables for S3-compatible offsite backup sync.
- [ ] **Proxy Configured:** API Gateway or Reverse Proxy (e.g., Nginx, ALB) configured for TLS termination. See `docs/REVERSE_PROXY_TLS.md`.
- [ ] **Environment Variables:** `.env` file populated on the host with production secrets and exact HTTPS `ALLOWED_ORIGINS`.

## 3. Deployment Execution

- [ ] **Pull Images:** `docker compose pull`
- [ ] **Start Database Only:** `docker compose up -d postgres`
- [ ] **Verify Database Health:** Wait for postgres to be ready.
- [ ] **Run Migrations:** The `migrate` service will run automatically when the backend starts, but can be run manually if preferred.
- [ ] **Start All Services:** `docker compose up -d`
- [ ] **Verify Container Status:** `docker compose ps` — all services should be `Up`.

## 4. Post-Deployment Verification

- [ ] **Health Check:** `curl -s https://api.yourdomain.com/health/ready` returns `{"status":"OK"}`.
- [ ] **Metrics Endpoint:** `curl -s https://api.yourdomain.com/metrics` returns Prometheus-format metrics (OPS-01).
- [ ] **Backup Status:** `curl -s https://api.yourdomain.com/api/v1/backups/status` returns backup configuration and latest backup info.
- [ ] **Admin Login:** Successfully log in to the staff portal using the initial admin credentials.
- [ ] **PACS Connectivity:** Verify Orthanc is accessible and the OHIF viewer loads correctly.
- [ ] **Webhook Verification:** Send a test payload to the PACS webhook to ensure it authenticates correctly.
- [ ] **Backup Test:** Trigger a manual backup (`POST /api/v1/backups/generate`) and verify the encrypted `.gz` file is created and replicated offsite.

## 5. Security Validation

- [ ] Verify HTTP traffic is redirected to HTTPS.
- [ ] Verify Security Headers (HSTS, CSP, X-Frame-Options) are present on frontend responses.
- [ ] Attempt to access the API from an unapproved origin (should be blocked by CORS).
- [ ] Verify `validateEnv.js` did not log any warnings about placeholder secrets in the backend logs.
- [ ] Configure alerting rules from `docs/ops-alerting-rules.yml.example` in your monitoring platform (OPS-02).
