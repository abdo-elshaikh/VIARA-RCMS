# VIARA Performance Testing Guide

This guide describes the implemented harness, synthetic fixture requirements, and release acceptance evidence. Run commands from the repository root. Successful unit tests or container builds do not establish performance acceptance.

## Prepare an isolated target

Use a separate deployment with synthetic data, separate PostgreSQL and Redis storage, and a test PACS archive. Scenarios can create patients, book appointments, collect payments, and replace report drafts. Even a quick run can write data.

Every run requires --synthetic to confirm that the selected deployment is suitable for these operations. This is an operator assertion; the flag cannot inspect the target's data. The harness checks /health/ready and stops before load if readiness is not 200. Also verify frontend, portal, OHIF, PostgreSQL, Redis, and Orthanc health and available host resources. Backend readiness alone does not prove the imaging workflow works.

Provision fixtures into a new disposable database. Never seed, truncate, flush Redis, rotate keys, or restart a shared deployment to prepare a benchmark. Restore the disposable fixture snapshot between comparable runs. Record the source snapshot, image digests, configuration, fixture size, and generator/server hardware.

Use Node.js 22 or later for the complete harness. Browser observations use Node's WebSocket API and an installed Chrome, Chromium, or Edge. The harness does not download browser packages or open your regular browser profile.

## Configure accounts and fixtures

The harness reads the repository-root .env without overriding variables already set in the process environment. Prefer a dedicated shell with explicit values for the isolated target. Do not publish credentials, tokens, cookies, or credential-pool files.

| Variable | Purpose |
|---|---|
| PERF_BASE_URL | Backend origin; default http://localhost:3000 |
| PERF_BRANCH_ID | Authorized active branch sent as x-branch-id |
| PERF_ADMIN_EMAIL / PERF_ADMIN_PASSWORD | Synthetic administrator |
| PERF_RECEPTION_EMAIL / PERF_RECEPTION_PASSWORD | Synthetic receptionist |
| PERF_RADIOLOGIST_EMAIL / PERF_RADIOLOGIST_PASSWORD | Synthetic radiologist |
| PERF_CASHIER_EMAIL / PERF_CASHIER_PASSWORD | Synthetic cashier |
| PERF_PATIENT_MRN / PERF_PATIENT_PASSWORD | Synthetic portal patient |
| PERF_USER_POOL_FILE | Optional local JSON file of independent accounts per role |
| PERF_TIMEOUT_MS | API timeout; default 15000 ms |
| PERF_THINK_MIN_MS / PERF_THINK_MAX_MS | Think time; defaults 500–2000 ms |
| PERF_METRICS_TOKEN | Backend /metrics token; falls back to METRICS_TOKEN |
| PERF_VIEWER_URL | Actual OHIF viewer route, for example http://localhost:3005/viewer |
| PERF_VIEWER_STUDY_UID | Reconciled synthetic study accessible to the test radiologist |
| PERF_BROWSER_EXECUTABLE | Installed Chrome/Chromium/Edge; common paths are also checked |
| PERF_IMAGE_SAMPLES | Browser observations per imaging scenario; default 20, maximum 100 |

Each role uses one cached account by default. Fifty VUs then mean fifty simulated clients, not fifty independently authenticated people. For independent sessions, provide enough accounts per role in a credential pool. Accounts need active memberships, the correct role in PERF_BRANCH_ID, any required attendance, and completed password changes.

The pool maps configured role names to arrays. Keep the real file outside version control. Values below are placeholders:

~~~json
{
  "radiologist": [
    { "email": "synthetic-radio-1@example.invalid", "password": "REPLACE_IN_LOCAL_FIXTURE" },
    { "email": "synthetic-radio-2@example.invalid", "password": "REPLACE_IN_LOCAL_FIXTURE" }
  ],
  "patient": [
    { "mrn": "SYNTHETIC-001", "password": "REPLACE_IN_LOCAL_FIXTURE" }
  ]
}
~~~

Assignment is stable per VU and role. Insufficient accounts produce a recorded worker failure instead of silently sharing an account. Browser observations reuse the first radiologist account.

Prepare at least 50 synthetic patients, 20 reportable examinations with unlocked draft reports assigned to the test radiologists, 10 payable invoices, three rooms, two machines, and a reconciled DICOM study. These are fixture requirements, not a guarantee made by seed.js. Verify the worklist and payment fixture. Locked/finalized examinations are unsuitable for draft saves. Check stored business results as well as HTTP response codes.

## Run the scenarios

PowerShell setup for an already provisioned isolated deployment:

~~~powershell
$env:PERF_BASE_URL = 'http://localhost:3000'
$env:PERF_BRANCH_ID = 'REPLACE_WITH_SYNTHETIC_BRANCH_UUID'
$env:PERF_USER_POOL_FILE = 'D:\benchmark-private\synthetic-users.json'
$env:PERF_VIEWER_URL = 'http://localhost:3005/viewer'
$env:PERF_VIEWER_STUDY_UID = 'REPLACE_WITH_SYNTHETIC_STUDY_UID'
~~~

Configure credentials, metrics token, and any browser path in that private environment. Help does not start load:

~~~powershell
node performance-tests/run.js --help
node performance-tests/run.js --synthetic --quick
node performance-tests/run.js --synthetic --scenario=08 --users=5 --duration=30
node performance-tests/run.js --synthetic --scenario=08 --users=25 --duration=60
node performance-tests/run.js --synthetic --scenario=08 --users=50 --duration=120
node performance-tests/run.js --synthetic --scenario=12 --users=50 --duration=360
node performance-tests/run.js --synthetic --scenario=13 --users=20 --duration=1920
~~~

Scenario 12 ramps up across 30 seconds and scenario 13 across 60 seconds. Workers loop until the shared deadline and finish their current operation; there is no separate staged ramp-down. These commands leave at least five minutes and thirty minutes after ramp-up. Fewer than 50 VUs or less than 330 seconds in scenario 12, and fewer than 20 VUs or less than 1860 seconds in scenario 13, remain exploratory and cannot produce acceptance PASS.

Scenario 08 implements 30% reception, 20% reporting, 10% billing, 20% patient portal, 10% administration, and 10% PACS across groups of ten VU IDs. Small runs do not cover that whole distribution. Scenarios 12/13 use 30% reception, 20% reporting, 10% cashier, and 40% reference-data reads. Record the model; it does not automatically represent a site's staff mix.

| ID | Focus |
|---|---|
| 01 | Authentication, refresh, logout |
| 02 | Reception, patient search, booking |
| 03 | Worklist and report saving |
| 04 | Billing and payment idempotency |
| 05 | Patient portal |
| 06 | Administration and analytics |
| 07 | PACS metadata/system queries and configured browser observations |
| 08 | Mixed operational workload |
| 09 | Intentional concurrency collisions |
| 10 | Spike/surge |
| 11 | Endurance and refresh storms |
| 12 | Clinical peak load |
| 13 | Clinical soak |

Run --scenario=all for sequential coverage. Stress discovery at 100 VUs is separate from normal-load acceptance and requires infrastructure allocated for that load.

## Measure the first diagnostic image

OHIF exports window.__viaraFirstDiagnosticImage after a Cornerstone render event on a visible canvas at least 256 by 256 CSS pixels, excluding viewport IDs marked thumbnail/preview/prefetch. Time starts at navigation and includes application loading and rendering. Metadata, iframe load, and thumbnail success do not substitute for this observation.

Configure PERF_VIEWER_URL and PERF_VIEWER_STUDY_UID for scenarios 07/08/12/13. The harness requests a study-scoped token, starts an isolated headless browser with its cache disabled, and reads the render observation. Samples are spread over the configured workload duration. Reports contain elapsed times and generic endpoint labels, without study UIDs, tokens, images, or browser storage. Only the newly created temporary browser profile is removed.

At least twenty successful observations are required. A render failure fails the imaging criterion. Missing configuration, too few samples, or an absent signal leaves acceptance incomplete; it is not a passing zero. Verify this signal on the actual packaged OHIF image. A unit test of the hook does not prove a real study rendered.

Use a separate generator host for capacity measurements. Browser observations consume client resources and may continue after API workers finish. Check timestamps and actual duration to confirm overlap with sustained load.

## Acceptance and reports

| Criterion | Required result |
|---|---|
| Unexpected request error rate | Strictly below 1%; exactly 1% fails |
| GET p95 / p99 | At most 500 / 1500 ms |
| Mutation p95 / p99 | At most 1000 / 2500 ms |
| Diagnostic first-image p95 | At most 5000 ms and at least twenty successful observations |
| Normal-workflow server errors | Zero 5xx in scenarios 01–08, 12, and 13 |
| Soak read-latency growth | At most 20% between first and last five-minute windows |
| Soak duration/samples | At least 1800 measured seconds and twenty successful GET samples per window |
| Backend memory observations | At least two valid RSS/heap samples per soak window |

Imaging requirements apply to imaging scenarios. Write-latency requirements are omitted for the read-only administration and PACS scenarios. Other configured but unmeasured operations remain incomplete. Known collision outcomes must be explicitly accepted by that scenario's assertions; unrelated 4xx responses are not automatically excluded.

The collector uses nearest-rank percentiles and preserves original timestamps in combined reports. API timing includes response-body reading. Browser observations have separate counts instead of inflating API throughput. Overall mixed API p95 is descriptive; read, mutation, and imaging criteria determine acceptance.

The harness samples /metrics every thirty seconds for backend RSS, heap use, and waiting database clients. Missing/unauthorized telemetry is not reported as zero. Scenario 13 stores latency windows and memory averages in JSON. Latency growth can indicate saturation; it does not by itself prove a memory leak. Inspect the memory trend and use heap snapshots only in the isolated environment if further investigation is needed.

Markdown and JSON reports are written to performance-tests/reports/. Inspect thresholdEvaluations, thresholdStatus, diagnosticImageSamples, diagnosticImageFailures, stability, serverSamples, virtualUsers, identityModel, and exploratory. No intermediate five-minute console summary is implemented: inspect the final recorded windows. An empty, quick, or short run does not prove site acceptance.

| Exit | Meaning |
|---|---|
| 0 | Every required measurement in this run passed |
| 1 | A measured criterion, setup/readiness, or execution failed |
| 2 | No measured criterion failed, but required evidence/profile is incomplete |

## Investigate failures and repeat safely

For authentication failures, check fixture credentials, branch membership/role, password-change state, attendance, and license availability. Do not reseed shared storage or change JWT/encryption keys. For slow reads, inspect the actual query plan under the restricted application role with the same authorized data scope; an owner query seeing different rows is not an equivalent baseline.

Correlate errors and waits with backend logs, PostgreSQL activity, and Redis health. Preserve production security and rate-limit behavior in release acceptance: disabling controls measures another configuration. For absent image observations, verify the study, scoped viewer authorization, OHIF health, installed browser, and actual viewport event.

Between comparable runs, restore only the named disposable deployment and preserve the evidence. This guide provides no shared FLUSHDB, table truncation, patient deletion, or public inspector command. Never expose a Node inspector publicly to collect benchmark diagnostics.
