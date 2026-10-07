# VIARA Performance Testing Guide

This guide covers how to prepare the environment, run every performance scenario, interpret results, and debug failures. It is the operational companion to `PERFORMANCE_TEST_PLAN.md`.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Seed Data Setup](#2-seed-data-setup)
3. [Running Scenarios](#3-running-scenarios)
4. [Acceptance Criteria](#4-acceptance-criteria)
5. [Interpreting Results](#5-interpreting-results)
6. [Debugging Failures](#6-debugging-failures)
7. [Reset Between Runs](#7-reset-between-runs)

---

## 1. Prerequisites

### 1.1 Clean Environment Checklist

Before starting any performance run, verify each item:

| Check | Command | Expected |
|---|---|---|
| Docker stack healthy | `docker compose ps` | All services `Up (healthy)` |
| Backend reachable | `curl http://localhost:3000/health/ready` | `200 OK` |
| No background load | `docker stats --no-stream` | CPU < 10% at idle |
| Redis reachable | `docker compose exec redis redis-cli ping` | `PONG` |
| Database reachable | `docker compose exec postgres pg_isready` | `accepting connections` |

A service that is merely `Up` but not `healthy` will produce misleading results — wait for all health checks to pass.

### 1.2 Required Tools

The harness runs on **Node.js v20 or later** with no external npm dependencies (it uses the built-in `fetch` API). No additional tools need to be installed for the custom Node.js harness.

For the optional k6 script (`performance-tests/k6/viara_load_test.js`), install k6 separately:

```bash
# macOS
brew install k6

# Windows (Chocolatey)
choco install k6

# Linux
sudo apt-get install k6
```

Check versions:

```bash
node --version   # must be >= 20.0.0
k6 version       # optional, only for k6 scenarios
```

### 1.3 Environment Variables

The harness reads its configuration from the root `.env` file at `d:\VIARA\.env`. The following variables are recognised:

| Variable | Default | Purpose |
|---|---|---|
| `PERF_BASE_URL` | `http://localhost:3000` | Target API base URL |
| `PERF_ADMIN_EMAIL` | `developer@viara.com` | Admin/Developer account email |
| `PERF_ADMIN_PASSWORD` | *(TEST_USER_PASSWORD)* | Admin password |
| `PERF_RECEPTION_EMAIL` | `reception@viara.com` | Receptionist account email |
| `PERF_RECEPTION_PASSWORD` | *(TEST_USER_PASSWORD)* | Receptionist password |
| `PERF_RADIOLOGIST_EMAIL` | `alice@viara.com` | Radiologist account email |
| `PERF_RADIOLOGIST_PASSWORD` | *(TEST_USER_PASSWORD)* | Radiologist password |
| `PERF_CASHIER_EMAIL` | `cashier@viara.com` | Cashier account email |
| `PERF_CASHIER_PASSWORD` | *(TEST_USER_PASSWORD)* | Cashier password |
| `PERF_PATIENT_MRN` | `MRN-000001` | Patient MRN for portal tests |
| `PERF_PATIENT_PASSWORD` | `Patient@123` | Patient portal password |
| `TEST_USER_PASSWORD` | *(required by seed)* | Master password used by seed.js |
| `DATABASE_URL` | *(required by seed)* | PostgreSQL connection string |
| `PERF_TIMEOUT_MS` | `15000` | Per-request HTTP timeout in ms |
| `PERF_THINK_MIN_MS` | `500` | Minimum think time between actions |
| `PERF_THINK_MAX_MS` | `2000` | Maximum think time between actions |

Override any variable on the command line:

```bash
PERF_BASE_URL=http://staging.viara.internal:3000 node performance-tests/run.js --scenario=08 --users=25
```

---

## 2. Seed Data Setup

Performance tests require seeded users and at least one existing patient, exam, and invoice to exercise read and update paths.

### 2.1 Seed the database

Run the seed script from the `backend/` directory:

```bash
cd d:\VIARA\backend
TEST_USER_PASSWORD=ViaraAdmin@2026 node seed.js
```

> The seed script will exit with an error if `TEST_USER_PASSWORD` or `DATABASE_URL` is not set.
> Both must be present in your shell or in `backend/.env` / root `.env`.

### 2.2 Verify seeded accounts

After seeding, confirm the performance test accounts exist:

```bash
# Verify staff login works
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"reception@viara.com","password":"ViaraAdmin@2026"}' | jq .token

# Verify patient login works
curl -s -X POST http://localhost:3000/api/portal/login \
  -H "Content-Type: application/json" \
  -d '{"mrn":"MRN-000001","password":"Patient@123"}' | jq .token
```

Both commands should return a non-null token.

### 2.3 Minimum data requirements

| Entity | Minimum count | Why |
|---|---|---|
| Patients | ≥ 50 | Receptionist search scenarios need varied results |
| Exams | ≥ 20 with `Draft` report status | Clinical worklist and report-save scenarios |
| Invoices | ≥ 10 | Cashier and billing scenarios |
| Rooms & machines | ≥ 3 rooms, ≥ 2 machines | Booking and matrix scenarios |

The default seed script creates sufficient data for all scenarios. If re-running on a fresh database, run seed once; do not run it multiple times without truncating tables first (duplicate key errors will appear in logs, which is harmless, but indicates redundant runs).

---

## 3. Running Scenarios

All commands are run from the **workspace root** `d:\VIARA`.

### 3.1 Quick smoke test (single VU, 5 seconds)

```bash
node performance-tests/run.js --quick
```

Use this to verify connectivity and that all accounts authenticate before investing time in heavier runs.

### 3.2 Baseline — 5 virtual users (smoke / baseline)

```bash
node performance-tests/run.js --scenario=08 --users=5 --duration=30
```

Establishes the single-digit-VU baseline for comparison against higher-load runs.

### 3.3 Normal load — 25 virtual users

```bash
node performance-tests/run.js --scenario=08 --users=25 --duration=60
```

Simulates a typical operational shift with all staff roles active.

### 3.4 Peak load — 50 virtual users

```bash
node performance-tests/run.js --scenario=08 --users=50 --duration=120
```

Simulates peak clinic hours. All acceptance thresholds must pass at this level.

### 3.5 Stress test — 100 virtual users

```bash
node performance-tests/run.js --scenario=08 --users=100 --duration=120
```

Pushes beyond the stated SLA ceiling to find the breaking point. Threshold failures at this level are expected and informative, not blocking.

### 3.6 Peak Load scenario — 50 VU × 5 minutes (Scenario 12)

This scenario implements a realistic clinical workflow across all staff roles. It is intended to run with 50 concurrent users for a sustained 5-minute window.

```bash
# 360 s = 30 s ramp-up buffer + 300 s sustained + 30 s ramp-down buffer
node performance-tests/run.js --scenario=12 --users=50 --duration=360
```

Workflow covered per VU:
- Receptionist (30%): patient search → queue view → shift status
- Radiologist (20%): worklist → exam detail → report draft save
- Cashier (10%): invoice list → cashier shift
- Mixed reads (40%): room matrix, exam types catalog, modalities list

### 3.7 Soak Test — 20 VU × 30 minutes (Scenario 13)

This scenario detects memory leaks and connection-pool exhaustion by running the same clinical workflow at a moderate load for an extended period.

```bash
# 1920 s = 60 s ramp-up buffer + 1800 s sustained + 60 s ramp-down buffer
node performance-tests/run.js --scenario=13 --users=20 --duration=1920
```

Compare the p95 values at the beginning of the run against those at the end of the run in the generated Markdown report. Growing p95 over time is the primary indicator of resource leakage.

### 3.8 Run all scenarios sequentially

```bash
node performance-tests/run.js --users=10 --duration=30
```

Runs every registered scenario in sequence (01 through 13) and produces both per-scenario and combined summary reports.

### 3.9 Run a specific scenario by name

```bash
node performance-tests/run.js --scenario=01 --users=5 --duration=30
node performance-tests/run.js --scenario=03 --users=10 --duration=60
```

Scenario IDs and names:

| ID | Name | Focus |
|---|---|---|
| `01` | Auth & Session Lifecycle | Login, token refresh, logout |
| `02` | Receptionist & Patient Booking | Patient search, rooms, appointments |
| `03` | Clinical Worklist & Reporting | Radiologist worklist, exam detail, report draft |
| `04` | Billing & Idempotent Payments | Invoice lookup, payment idempotency |
| `05` | Patient Portal & Case Status | Portal login, case tracking |
| `06` | Admin Analytics & Audits | Statistics, audit logs |
| `07` | PACS Studies & Modalities | Orthanc study queries |
| `08` | Blended Multi-Role Concurrency | All roles, Section 4 distribution |
| `09` | Concurrency Collision (PF-13) | Race conditions, double-booking, double-payment |
| `10` | Spike & Surge Load (PF-05) | Rapid burst handling and recovery |
| `11` | Endurance & Token Storms (PF-06/PF-12) | Long-running soak + token refresh |
| `12` | Peak Load — Clinical Workflow (H-04) | 50 VU realistic clinical workflow |
| `13` | Soak Test — Stability (H-04) | 20 VU × 30 min memory leak detection |

### 3.10 Targeting a different server

```bash
node performance-tests/run.js --target=http://staging.viara.internal:3000 --scenario=12 --users=50 --duration=360
```

---

## 4. Acceptance Criteria

These thresholds are enforced automatically by the harness and evaluated in every generated report.

| Metric | Threshold | Notes |
|---|---|---|
| **Error rate** | < 1% | Unexpected errors (5xx, timeouts). 4xx from intentional collision tests are excluded. |
| **Read API p95** | ≤ 500 ms | All GET requests |
| **Read API p99** | ≤ 1500 ms | Slowest 1% of GET requests |
| **Write/Search API p95** | ≤ 1000 ms | POST, PUT, PATCH, DELETE |
| **Write/Search API p99** | ≤ 2500 ms | Slowest 1% of writes |
| **Diagnostic image load p95** | ≤ 5000 ms | PACS / Orthanc study fetch |
| **Memory stability (soak)** | p95 must not grow > 20% | Compare start vs end of Scenario 13 |
| **Zero 5xx for normal workflows** | 0 | Scenarios 01–08, 12, 13 must have 0 server errors |

A test run **passes** when all threshold evaluations in the generated report show `✅ PASS`.

---

## 5. Interpreting Results

### 5.1 Console output

When a scenario finishes, the harness prints a summary table:

```
================================================================================
 📊 Scenario [12_peak_load] Results
================================================================================
⏱️  Duration: 360s | 🔄 Total Requests: 18430 | 🚀 Throughput: 51.19 req/s
✅ Success: 18421 | ❌ Failed: 9 | ⚠️ Error Rate: 0.05%

--- ⏱️  Overall Latency (Response Times) ---
   Min: 8ms | Avg: 145ms | Median (p50): 112ms
   p75: 180ms | p90: 290ms | p95: 380ms | p99: 890ms | Max: 3210ms

--- 🎯 SLA Thresholds Evaluation ---
   ✅ PASS [Error Rate < 1%]: Actual 0.05% (Target: < 1%)
   ✅ PASS [Read API Latency (p95)]: Actual 380.0ms (Target: <= 500ms)
   ✅ PASS [Write & Mutation Latency (p95)]: Actual 620.0ms (Target: <= 1000ms)

--- 🔍 Top Endpoints by Latency (p95) ---
Method  | Endpoint                              | Count | p50 (ms) | p95 (ms) | p99 (ms) | Err %
--------------------------------------------------------------------------------
PUT     | /api/exams/:id/report                 |  1840 |      320 |      620 |     1190 |  0.1%
GET     | /api/exams/worklist                   |  2210 |      180 |      380 |      760 |  0.0%
...
================================================================================
```

Key fields to check:
- **Error Rate**: must be < 1%; investigate if it approaches 0.5%.
- **p95 / p99**: compare against the thresholds above.
- **Top Endpoints by Latency**: the slowest endpoint is listed first — this is where to focus optimisation effort.

### 5.2 Report files

After each scenario, two files are written to `performance-tests/reports/`:

| File | Format | Use |
|---|---|---|
| `report_<scenario>_<timestamp>.md` | Markdown | Human-readable summary for commit or review |
| `report_<scenario>_<timestamp>.json` | JSON | Machine-readable; use for CI trend comparison |

Open the Markdown report to see the full endpoint breakdown table. For soak tests, check that no endpoint's p95 value grows significantly from one run segment to the next.

### 5.3 Spotting a memory leak in soak results

Run Scenario 13 and compare results in the report:

1. Note the overall `p95` in the console at the **5-minute mark** (first batch of workers completing their first few iterations).
2. Compare with the `p95` printed at the **end of the 30-minute run**.
3. A steady increase (> 20% growth in p95 over 30 minutes) suggests a memory leak or connection-pool saturation.

To get finer time-series data, check the backend process memory while the test runs:

```bash
# In a separate terminal — sample every 30 seconds
while ($true) {
    docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}" | Select-String "backend"
    Start-Sleep 30
}
```

---

## 6. Debugging Failures

### 6.1 High error rate (> 1%)

1. Check backend logs:
   ```bash
   docker compose logs --tail=100 backend
   ```
2. Look for `500 Internal Server Error` or `503 Service Unavailable` lines.
3. Common causes:
   - Database connection pool exhausted: increase `DB_POOL_MAX` in backend config.
   - Redis unavailable: `docker compose restart redis`.
   - JWT secret mismatch after container restart: re-run seed and re-start backend.

### 6.2 Slow p95 (GET > 500 ms)

1. Enable slow-query logging in PostgreSQL:
   ```bash
   docker compose exec postgres psql -U viara -c "ALTER SYSTEM SET log_min_duration_statement = 100;"
   docker compose exec postgres psql -U viara -c "SELECT pg_reload_conf();"
   docker compose logs postgres | Select-String "duration"
   ```
2. Check connection pool utilisation:
   ```bash
   docker compose exec postgres psql -U viara -c "SELECT count(*) FROM pg_stat_activity WHERE state='active';"
   ```
3. If the pool is at max, reduce `--users` or increase `DB_POOL_MAX`.
4. Check for missing indexes on `exams.worklist` query by looking at `EXPLAIN ANALYZE` output for the top slow query.

### 6.3 Memory growth (soak test p95 creeping up)

1. Take a Node.js heap snapshot before and after:
   ```bash
   # Trigger heap dump via the backend's diagnostic endpoint (if enabled):
   curl http://localhost:3000/admin/heap-dump
   ```
2. If no endpoint is available, attach the Node.js inspector:
   ```bash
   docker compose exec backend node --inspect=0.0.0.0:9229 ...
   ```
   Then open `chrome://inspect` to capture a heap snapshot.
3. Look for growing `Array`, `Buffer`, or event-listener counts between snapshots.

### 6.4 Auth failures (scenario exits early)

Symptoms: scenario logs show `Authentication failed for receptionist` and requests stop.

1. Verify the seed accounts exist and use the correct password:
   ```bash
   curl -s -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"reception@viara.com","password":"ViaraAdmin@2026"}' | jq .
   ```
2. If the token is null or 401 is returned, re-run `node backend/seed.js`.
3. Check that `TEST_USER_PASSWORD` in your `.env` matches the password used in the scenario config (`config.js` → `users` section).
4. If running against a staging server, ensure the accounts have been seeded there too.

### 6.5 Connection refused (cannot reach server)

```bash
# Confirm backend container is healthy
docker compose ps
# Restart if stopped
docker compose up -d backend
# Tail logs for startup errors
docker compose logs -f backend
```

### 6.6 Scenario reports 0 requests

This means the scenario function errored before recording anything. Run with a single VU and a short duration to see the raw error:

```bash
node performance-tests/run.js --scenario=12 --users=1 --duration=10 --quick
```

Check for `❌ Fatal execution error` or `unhandled_worker_error` in the console output.

---

## 7. Reset Between Runs

When running multiple successive test rounds, reset shared state to avoid result contamination.

### 7.1 Flush Redis cache and rate-limit counters

```bash
docker compose exec redis redis-cli FLUSHDB
```

> This clears the current database only. Session tokens cached by the test harness are in-process; they are cleared automatically by `userPool.invalidate()` between scenarios.

### 7.2 Reset rate limits

If the backend enforces per-IP or per-user rate limits that trigger during load tests, flush them from Redis:

```bash
# Clear rate-limit keys (adjust the key prefix to match your backend's config)
docker compose exec redis redis-cli --scan --pattern "rate:*" | ForEach-Object { docker compose exec redis redis-cli DEL $_ }
```

### 7.3 Purge generated synthetic patients (optional)

The `02_reception_booking.js` scenario creates synthetic patients when a search returns no results. On repeated runs these accumulate. To clean up:

```bash
docker compose exec postgres psql -U viara -c \
  "DELETE FROM patients WHERE first_name LIKE 'TestPatient_%';"
```

### 7.4 Restart backend to reset in-process state

Between a soak test and the next run, restart the backend to reset Node.js heap and connection pools to their initial state:

```bash
docker compose restart backend
# Wait for healthy status
docker compose ps
```

### 7.5 Clear old reports (optional)

```bash
# Windows PowerShell — remove reports older than 7 days
Get-ChildItem d:\VIARA\performance-tests\reports -File |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
  Remove-Item
```

---

## Quick Reference

```bash
# Smoke test — single user, 5 seconds
node performance-tests/run.js --quick

# Baseline — 5 VUs, 30 seconds
node performance-tests/run.js --scenario=08 --users=5 --duration=30

# Normal load — 25 VUs, 60 seconds
node performance-tests/run.js --scenario=08 --users=25 --duration=60

# Peak load — 50 VUs, 120 seconds
node performance-tests/run.js --scenario=08 --users=50 --duration=120

# Stress test — 100 VUs, 120 seconds
node performance-tests/run.js --scenario=08 --users=100 --duration=120

# Peak load scenario (H-04) — 50 VUs × 5 minutes + ramp buffers
node performance-tests/run.js --scenario=12 --users=50 --duration=360

# Soak test (H-04) — 20 VUs × 30 minutes + ramp buffers
node performance-tests/run.js --scenario=13 --users=20 --duration=1920

# All scenarios — 10 VUs, 30 seconds each
node performance-tests/run.js --users=10 --duration=30
```
