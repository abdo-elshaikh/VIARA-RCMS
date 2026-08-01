# RCMS Full Pre-Deployment Software Review

**Review date:** 2026-08-02  
**Reviewer:** Codex automated and source-assisted review  
**Workspace:** `D:\RCMS`  
**Decision:** **NOT READY FOR PRODUCTION**

## Executive Summary

The application has a substantial working core. Clean dependency installation, backend and frontend automated tests, both web builds, portal type checking, AI-worker tests, a complete fresh database migration, and a 44-check live API validation all pass after the fixes made during this review. The live validation exercised authentication, session revocation, personal access tokens, role boundaries, payment and refund concurrency, claim transitions, patient merge lineage, forced password changes, finalized financial periods, refresh-token replay detection, and tamper-evident audit chains.

Production deployment must nevertheless be blocked. The reviewed directory has no usable Git metadata and changed underneath the review: the portal directory was renamed, project documentation disappeared, and the CI workflow disappeared before it was restored. There is therefore no trustworthy commit, history, review base, or reproducible source artifact to approve. In addition, the checked-in deployment configuration does not have the required production origins, backup encryption key, or malware scanner path, and locally present credentials must be treated as untrusted until rotated and loaded through a managed secret store.

The highest residual technical risks are unverified container/infrastructure behavior, runtime DDL and migration activity in the API process, insufficient protection for chat and PACS uploads, persistent browser storage of staff bearer tokens, missing portal account lockout, and incomplete production operations evidence.

## Severity Summary

Unresolved findings:

| Severity | Count |
|---|---:|
| Blocker | 2 |
| Critical | 0 |
| High | 9 |
| Medium | 7 |
| Low | 4 |
| Informational | 3 |

Resolved during this review:

| Original severity | Count |
|---|---:|
| Critical | 1 |
| High | 6 |
| Medium | 6 |
| Low | 1 |

## Scope and Architecture Reviewed

- React/Vite staff application in `frontend/`
- React/TypeScript/Vite patient and referring-doctor portal in `portal/`
- Express 5/PostgreSQL API in `backend/`
- PostgreSQL schema, 92 migrations, RBAC and demo seeds in `database/`
- Orthanc PACS, OHIF viewer, DICOM worklists, reconciliation, upload, and AI queue integration
- FastAPI/Python chest-radiograph AI worker in `pacs/ai-worker/`
- Dockerfiles, Docker Compose, local launcher, environment validation, backup scheduling, health endpoints, logging, and CI workflow
- Authentication, authorization, 2FA, session/token handling, PII encryption, audit integrity, billing, cashier, refunds, claims, payroll controls, and patient merge behavior

## Assumptions and Limitations

- No production domain, TLS certificate, reverse-proxy configuration, managed database, secret store, monitoring account, backup repository, modality, or production-like environment was supplied.
- Docker CLI and Compose were installed, but the Docker Desktop Linux daemon was unavailable. Compose syntax was validated; images and the complete container topology could not be built or run.
- PostgreSQL was available locally. Fresh migration and validation used a uniquely named disposable database; the existing `rcms` database was not reset or replaced.
- No usable Git repository was present. `.git` contained only `.git/info/exclude`; branch, commit, diff, history, and whether secrets were ever committed could not be established.
- No supported browser automation suite, seeded manual-test credentials, load environment, real DICOM modality, email/SMS sandbox, or assistive-technology lab was present. Browser E2E, responsive visual QA, accessibility certification, load/stress, delivery-provider, and real modality tests were not claimed.
- Python `pip-audit` was unavailable. Python dependency vulnerability status is therefore not attested.
- Regulatory suitability, clinical validation, privacy-law compliance, and medical-device classification require qualified legal, security, privacy, and clinical owners. This review is not a certification.

## Verification Results

| Area | Result | Evidence |
|---|---|---|
| Runtime inventory | Pass | Node 22.17.0, npm 10.9.2, Python 3.13.5, PostgreSQL client 18.1, Docker/Compose CLI available |
| Clean npm installs | Pass | `npm ci` completed for backend, frontend, and portal |
| Backend tests | Pass | 32 suites, 179 tests |
| Backend coverage | Weak | Lines 33.10%, statements 33.74%, functions 48.37%, branches 21.95% |
| Frontend lint | Pass | ESLint with zero warnings allowed |
| Frontend tests | Pass | 33 files, 92 tests |
| Frontend production build | Pass with warning | Main JS chunk 880.61 kB (239.58 kB gzip); two large PNG assets are 1.11 MB and 1.49 MB |
| Portal type check | Pass | `tsc --noEmit` |
| Portal production build | Pass | Vite production build |
| Portal lint/tests | Missing | No lint or test scripts exist |
| AI worker syntax/tests | Pass with warning | Python compile succeeded; 6 tests passed; pytest asyncio scope warning remains |
| Fresh database | Pass | Schema, 92 migrations, and all seeds applied to a disposable database |
| Live API/database validation | Pass | 44 checks; disposable database removed afterward |
| Compose syntax | Pass | `docker compose config --quiet` |
| Container build/runtime | Blocked | Docker daemon unavailable |
| Backend npm production audit | Pass | 0 vulnerabilities after the safe override and lockfile refresh |
| Frontend npm production audit | Partial | 2 moderate React Router advisories; fix requires a breaking v7 upgrade |
| Portal npm production audit | Partial | Same 2 moderate React Router advisories |
| Python audit | Not run | `pip-audit` not installed |
| Local runtime smoke | Pass | `http://localhost:3000/health/ready`, `:5173`, and `:5174` returned HTTP 200 |
| Production runtime/TLS/backup restore | Not run | Production infrastructure and secrets were not available |

## Detailed Unresolved Findings

### B-01 — Source provenance and workspace integrity cannot be established

**Severity:** Blocker  
**Component:** Repository root and release process  
**Evidence:** Git reports that `D:\RCMS` is not a repository. `.git` contains only `info/exclude`. During the review, `old_portal/` became `portal/`, `README.md` and `docs/` disappeared, and `.github/workflows/quality-gates.yml` disappeared before being restored.  
**Impact:** There is no immutable commit to approve, no reliable diff, no ownership or review trail, no way to prove the tested source matches a release artifact, and no way to search history for exposed secrets.  
**Reproduction:** Run `git status` and inspect `.git`; inventory the tree at two points in time.  
**Recommended fix:** Stop release activity; recover the authoritative repository from trusted remote storage; reconcile every current file; restore documentation; rotate credentials; require signed/protected release commits; rerun this review against one immutable commit and produce artifact checksums/SBOM.  
**Fixed during review:** No. The CI file was restored, but provenance cannot be recreated from this directory.  
**Remaining risk:** Total release-artifact uncertainty until a trusted source of record exists.

### B-02 — Production configuration and secret lifecycle are incomplete

**Severity:** Blocker  
**Component:** `.env`, `backend/.env`, `docker-compose.yml`, `backend/src/config/validateEnv.js`  
**Evidence:** Root configuration lacks `BACKUP_ENCRYPTION_KEY`, `ALLOWED_ORIGINS`, and `CLAMSCAN_PATH`, all required by production startup validation. Compose still defaults client URLs to localhost unless explicitly supplied. Local environment files contain multiple secret-bearing settings and live-looking third-party API keys. Values were not copied into this report. With no Git history, prior exposure cannot be excluded.  
**Impact:** The production API should fail startup; bypassing validation would permit unsafe CORS, unavailable document uploads, unencrypted/unrecoverable backup operations, or compromised credentials.  
**Reproduction:** Compare the root environment key inventory with the production branch of `validateEnv()`; start the backend with `NODE_ENV=production` and the current root variables.  
**Recommended fix:** Generate new independent high-entropy secrets; revoke/rotate all current DB, JWT, encryption, Orthanc, webhook, AI, email, and SMS credentials; store them in a managed secret service; set exact HTTPS origins and public URLs; install and health-check ClamAV; validate in staging without exposing values.  
**Fixed during review:** Partially. Production validation already fails closed and CORS no longer auto-allows localhost in production.  
**Remaining risk:** Production cannot be approved until rotation and a successful secret/configuration ceremony are evidenced.

### H-01 — Container topology and production integrations were not executed

**Severity:** High  
**Component:** Dockerfiles, `docker-compose.yml`, Orthanc, OHIF, AI worker  
**Evidence:** Docker Desktop Linux engine pipe was unavailable. Compose rendered, but images and services could not be built/run. The DICOM listener defaults to `0.0.0.0:4242`; OHIF and Orthanc behavior was not validated in the final topology.  
**Impact:** Image build failures, permission errors, health ordering, missing ClamAV, PACS authentication, storage persistence, DICOM exposure, and runtime-only incompatibilities may surface at deployment.  
**Reproduction:** `docker compose build` or `docker compose up` with the unavailable daemon.  
**Recommended fix:** Run the exact release artifact in an isolated staging network; restrict DICOM to the modality VLAN/VPN/firewall; verify C-ECHO/C-STORE/MWL, OHIF study-scoped access, health checks, persistent volumes, restart behavior, and AI profile behavior.  
**Fixed during review:** Partially. Backend runs as non-root, restart policies and backend health checks were added, and dependent web services wait for backend readiness.  
**Remaining risk:** Runtime behavior remains unproved until a real container run passes.

### H-02 — Production operations, recovery, and compliance evidence are absent

**Severity:** High  
**Component:** Deployment/operations  
**Evidence:** No verified TLS termination, HSTS at the public edge, centralized log retention, alert routing, error tracking, SLOs, on-call runbook, incident response exercise, restore test, RPO/RTO evidence, disaster recovery rehearsal, or clinical/regulatory approval was supplied. Deleted documentation worsens the gap.  
**Impact:** Security incidents, outages, data loss, and clinical workflow failures may be detected late or be unrecoverable.  
**Reproduction:** Request the most recent restore report, alert test, incident drill, and clinical/privacy sign-off; none is present in the reviewed tree.  
**Recommended fix:** Complete a staging deployment; perform encrypted backup and point-in-time restore tests; define RPO/RTO; connect logs/metrics/traces and alerts; test paging; document rollback and incident playbooks; obtain privacy, legal, clinical, and security sign-off.  
**Fixed during review:** No.  
**Remaining risk:** High operational and governance uncertainty.

### H-03 — The API process performs broad schema changes and permission seeding at startup

**Severity:** High  
**Component:** `backend/src/server.js`  
**Evidence:** The approximately 2,300-line startup module runs many `CREATE`, `ALTER`, index, migration, and seed operations, several through independent promises. Only the financial migration promise gates `app.listen`; other startup patches can run concurrently. The runtime database user therefore needs DDL privileges.  
**Impact:** Multiple replicas can race, partially applied patches can coexist with live traffic, startup time is unpredictable, and a compromised API process has excessive database privileges.  
**Reproduction:** Inspect startup queries and start two instances against an older schema.  
**Recommended fix:** Move all schema work to a single transactional, advisory-locked migration job; deploy schema before application replicas; give the application a DML-only role; remove duplicate startup migrations and permission seeds.  
**Fixed during review:** No.  
**Remaining risk:** Data/schema integrity risk during rollout and scaling.

### H-04 — Chat attachments trust declared MIME type and are not malware-scanned

**Severity:** High  
**Component:** `backend/src/utils/chatAttachmentUpload.js`  
**Evidence:** The filter accepts `file.mimetype`, writes the content to disk, and serves it back. It does not inspect magic bytes or call ClamAV. The document upload path has both controls, but chat attachments do not.  
**Impact:** An authenticated user or portal account can store disguised or malicious content and distribute it to staff or patients.  
**Reproduction:** Upload executable/polyglot content while declaring an allowed image, PDF, text, or Office MIME type.  
**Recommended fix:** Quarantine uploads, verify signatures and parsability, use one shared fail-closed malware pipeline, force download for risky formats, add `nosniff`/safe content disposition, and test malicious/renamed/polyglot samples.  
**Fixed during review:** No.  
**Remaining risk:** Stored-content attack path.

### H-05 — PACS upload limits permit extreme in-memory request consumption

**Severity:** High  
**Component:** `backend/src/routes/pacsRoutes.js`  
**Evidence:** Multer uses memory storage with up to 50 files and 100 MB per file, allowing approximately 5 GB of buffered request content before processing.  
**Impact:** A permitted or compromised account can exhaust the Node process/container memory and interrupt clinical operations.  
**Reproduction:** Send a multipart request near the documented maximum file count and size.  
**Recommended fix:** Stream to bounded quarantine storage, enforce a total request limit, lower concurrent upload limits, reserve memory in the container, add per-user concurrency/rate limits, and load-test worst-case DICOM studies.  
**Fixed during review:** No.  
**Remaining risk:** Authenticated denial of service.

### H-06 — Portal authentication lacks account-level brute-force protection

**Severity:** High  
**Component:** Patient and doctor login controllers/routes  
**Evidence:** Staff authentication has account lockout behavior, while patient and doctor portal authentication relies primarily on an IP limiter. Some responses distinguish inactive/not-activated accounts from invalid credentials.  
**Impact:** Distributed password guessing is not contained per account, and response differences aid account-state discovery.  
**Reproduction:** Submit failed portal logins for one account from changing source IPs and compare responses for unknown, inactive, and valid identifiers.  
**Recommended fix:** Add progressive per-account throttling/lockout, generic public errors, security event logging without identifiers, MFA or step-up controls where appropriate, and abuse alerting.  
**Fixed during review:** No.  
**Remaining risk:** Account takeover and enumeration.

### H-07 — Staff bearer tokens can persist in localStorage

**Severity:** High  
**Component:** `frontend/src/store/authSlice.js`, login “remember me” flow  
**Evidence:** Selecting “remember me” stores the access token in `localStorage`; otherwise it is in `sessionStorage`. JavaScript-readable storage is available to successful XSS and persistence increases the exposure window.  
**Impact:** XSS can exfiltrate privileged tokens able to access PHI, finance, and administration functions.  
**Reproduction:** Log in with “remember me” and inspect browser local storage.  
**Recommended fix:** Prefer short-lived in-memory access tokens with rotating, secure, HttpOnly, SameSite refresh cookies; remove persistent bearer-token storage; shorten lifetimes; retain strong CSP and add XSS regression tests.  
**Fixed during review:** No for the staff application. The separate portal’s local persistence was removed.  
**Remaining risk:** Privileged token theft following client-side injection.

### H-08 — Graceful shutdown does not stop all workers or drain the HTTP server

**Severity:** High  
**Component:** `backend/src/server.js` and background services  
**Evidence:** SIGTERM/SIGINT stop notification polling, inventory polling, and backup scheduling, then close the DB pool. The server handle is not retained/drained, and integration, retention, PACS MWL/tiering/AI, and audit jobs are not all stopped.  
**Impact:** Deployments can terminate in-flight requests or jobs, duplicate work, and access a closing pool.  
**Reproduction:** Send SIGTERM during an API request or background job and inspect shutdown behavior.  
**Recommended fix:** Retain the HTTP server, stop accepting traffic, expose not-ready state, drain in-flight requests with a deadline, stop every worker idempotently, then close queues and pool. Add a shutdown integration test.  
**Fixed during review:** Partially. Unknown unhandled rejections now log and terminate so the service manager can restart instead of serving from an uncertain process.  
**Remaining risk:** Non-graceful rolling deployments.

### H-09 — Custom AI endpoints allow privileged server-side requests without network policy

**Severity:** High  
**Component:** AI settings schemas/controllers and AI report/cloud vision services  
**Evidence:** Administrators can configure a custom base URL up to 1,000 characters; the backend normalizes and fetches it. The schema does not restrict scheme, loopback, link-local, private networks, or redirects.  
**Impact:** A compromised or malicious privileged account may use the server to probe internal services or cloud metadata endpoints and may send clinical context to an unintended host.  
**Reproduction:** Configure a custom endpoint pointing at an internal/loopback address and invoke connection test or inference.  
**Recommended fix:** Allow only HTTPS; resolve and reject loopback/private/link-local/reserved destinations on every redirect; apply an egress proxy/domain allowlist; require explicit security approval for custom providers; redact URLs and payloads from logs.  
**Fixed during review:** No.  
**Remaining risk:** Privileged SSRF and data exfiltration.

### M-01 — React Router production advisories remain

**Severity:** Medium  
**Component:** `frontend/` and `portal/` dependency trees  
**Evidence:** Production `npm audit` reports two moderate advisories in React Router 6.30.4. The safe automatic fix requires a breaking upgrade to React Router 7.  
**Impact:** Backslash-based open redirects may be exploitable if attacker-controlled destinations reach navigation APIs. The SSR hydration constructor issue appears lower relevance because these builds are client-only Vite SPAs.  
**Reproduction:** Run `npm audit --omit=dev` in either web project.  
**Recommended fix:** Plan and test the v7 migration, audit all navigation sources, add hostile-path tests, and document temporary risk acceptance if deployment proceeds after blockers are cleared.  
**Fixed during review:** No; a forced breaking upgrade was intentionally not applied.  
**Remaining risk:** Moderate until upgraded.

### M-02 — Automated coverage is too shallow for the application’s risk

**Severity:** Medium  
**Component:** Backend, frontend, portal, AI worker  
**Evidence:** Backend line coverage is 33.10% and branch coverage 21.95%. Frontend coverage is not configured. Portal has no lint or test script. AI tests are only six cases. No browser E2E or load suite exists in the reviewed tree.  
**Impact:** Regressions in clinical, privacy, portal, billing, and failure paths can reach production despite a green unit suite.  
**Reproduction:** Run backend Jest coverage and inspect package scripts.  
**Recommended fix:** Establish risk-based thresholds; add portal unit/integration tests, browser E2E for primary workflows and authorization boundaries, API contract tests, migration upgrade tests, and load/concurrency tests.  
**Fixed during review:** Partially. Broken frontend/AI tests were repaired and regression cases were added.  
**Remaining risk:** Significant untested surface.

### M-03 — CI does not fully cover Python, E2E, security, or immutable supply chain inputs

**Severity:** Medium  
**Component:** `.github/workflows/quality-gates.yml`  
**Evidence:** The restored workflow validates backend/frontend/portal and a real PostgreSQL migration, but omits AI-worker tests, Python audit, E2E, container builds, secret scanning, SAST, SBOM/license checks, and deployment smoke. GitHub actions use mutable major tags and container images are not digest-pinned. Branch protection could not be verified.  
**Impact:** Untested changes or upstream supply-chain movement may enter releases.  
**Reproduction:** Inspect workflow jobs and image/action references.  
**Recommended fix:** Pin actions and release images by digest; add Python, container, secret, SAST, SBOM/license, E2E, and staging-deploy gates; enforce protected required checks.  
**Fixed during review:** Partially. Portal checks, dependency audits, Compose validation, fresh migration, and live database validation were added/restored.  
**Remaining risk:** CI is stronger but not a complete release gate.

### M-04 — Frontend payloads exceed recommended performance budgets

**Severity:** Medium  
**Component:** Staff frontend production bundle  
**Evidence:** Main JS is 880.61 kB minified/239.58 kB gzip; CSS is 410.23 kB; two landing/login PNG assets exceed 1 MB each. Vite emits a chunk-size warning.  
**Impact:** Slower initial use on constrained clinic networks/devices, higher memory, and degraded perceived reliability.  
**Reproduction:** Run `npm run build` in `frontend/`.  
**Recommended fix:** Route-level code splitting, defer editor/chart/export modules, optimize responsive images, purge unused CSS, and enforce bundle budgets in CI.  
**Fixed during review:** No.  
**Remaining risk:** Performance and usability degradation.

### M-05 — Proxy and client-IP trust is topology-sensitive

**Severity:** Medium  
**Component:** Express proxy settings and rate limiting  
**Evidence:** The API trusts exactly one proxy hop. No authoritative production proxy topology is documented in the surviving tree.  
**Impact:** A mismatched topology can make IP rate limits/audit addresses inaccurate or permit spoofing.  
**Reproduction:** Deploy behind zero or multiple proxy hops and compare `req.ip`/rate-limit identity.  
**Recommended fix:** Define and test the actual trusted proxy CIDRs/hops, strip inbound forwarding headers at the edge, and add integration tests for real client IP extraction.  
**Fixed during review:** No.  
**Remaining risk:** Incorrect security attribution.

### M-06 — Application uploads use deprecated Multer 1.x

**Severity:** Medium  
**Component:** Backend upload paths  
**Evidence:** `multer@1.4.5-lts.1` emits a deprecation warning. Dependency audit is currently clean only after overriding a separate transitive archive library.  
**Impact:** Continued maintenance and future security-fix risk in a security-sensitive input boundary.  
**Reproduction:** Inspect backend install warnings and package manifest.  
**Recommended fix:** Migrate to Multer 2 or a maintained streaming multipart implementation, then rerun upload compatibility, limit, traversal, malware, and malformed multipart tests.  
**Fixed during review:** No.  
**Remaining risk:** Increasing maintenance/security debt.

### M-07 — Rollback and migration downgrade behavior is not defined

**Severity:** Medium  
**Component:** `database/`, release operations  
**Evidence:** Fresh forward migration passes, but no verified rollback scripts, backward-compatible deployment sequence, or restore-driven rollback runbook is present. Several migration numbers are duplicated historically, making filename-only reasoning harder.  
**Impact:** A failed release may require risky manual database intervention or prolonged outage.  
**Reproduction:** Attempt to identify and execute a supported rollback from migration 092 to the prior release.  
**Recommended fix:** Use immutable migration IDs and a ledger, document expand/migrate/contract releases, rehearse application rollback with forward-compatible schema, and use tested restore procedures for irreversible changes.  
**Fixed during review:** No.  
**Remaining risk:** Slow or unsafe rollback.

### Low findings

| ID | Finding | Evidence / impact | Recommendation | Fixed? |
|---|---|---|---|---|
| L-01 | Pytest async scope is implicit | AI tests emit a deprecation warning; a future plugin default may change fixture behavior | Set `asyncio_default_fixture_loop_scope = function` and pin/test plugin upgrades | No |
| L-02 | Test logs contain avoidable error noise | Health tests log RBAC cache `TypeError` messages and DICOM tests emit invalid-VR errors despite passing | Correct mocks/fixtures and fail CI on unexpected error logs | No |
| L-03 | Public readiness reveals pool statistics | Readiness data can assist low-value reconnaissance | Return minimal public status; keep detailed metrics authenticated/internal | No |
| L-04 | Development launcher’s Docker failure is non-fatal | With Docker unavailable, local API/web apps still start against existing local dependencies | Make dependency mode explicit and surface a persistent degraded-state banner | No |

### Informational findings

| ID | Finding |
|---|---|
| I-01 | Document uploads already include size/type checks, magic-byte validation, randomized names, path containment, authorization, and fail-closed production malware scanning. |
| I-02 | Refresh-token rotation/replay detection, session revocation, personal-token hashing/scope, forced-password gating, audit chaining, financial idempotency, refund separation, and finalized-period locks passed live validation. |
| I-03 | Helmet/CSP, request IDs, structured request logs, health endpoints, DB pool timeouts, encryption key format checks, and non-root backend container execution provide a useful baseline. |

## Defects Fixed During Review

### F-01 — AI safety gate accepted every study

**Original severity:** Critical  
**Defect:** `is_supported_chest_radiograph()` always returned `True`, allowing CT or non-chest studies into a chest-X-ray model.  
**Fix:** Restricted accepted modalities to CR/DX/DR/XR and required chest/thorax/CXR anatomy. Added negative CT-chest and DX-knee tests.  
**Verification:** AI worker compile succeeds; 6 tests pass.  
**Remaining risk:** DICOM metadata can be missing or inaccurate. Production should additionally use validated image-content checks and human oversight; AI output must remain non-diagnostic assistance.

### F-02 — Financial closure failed for PostgreSQL DATE values

**Original severity:** High  
**Defect:** JavaScript converted a PostgreSQL `DATE` object through `String(date).slice(0, 10)`, producing text such as `Sat Aug 01` and causing a 500 response.  
**Fix:** Added a canonical business-date normalizer and used it in financial posting/controller paths, with a regression test.  
**Verification:** Unit suite passes and the live finalization/period-lock flow passes against a fresh database.  
**Remaining risk:** Continue timezone-boundary testing with the deployed database/application timezone.

### F-03 — Deployment validation harness no longer matched governed workflows

**Original severity:** High  
**Defect:** The smoke harness omitted required idempotency headers, expected obsolete role behavior, did not complete a concurrent refund lifecycle, and used the host UTC date instead of the database business date.  
**Fix:** Updated the harness to current payment/refund/claim contracts and DB current date.  
**Verification:** All 44 deployment checks pass on a fresh database.  
**Remaining risk:** Harness must evolve with explicitly versioned API contracts.

### F-04 — 2FA verification lacked complete validation/rate limiting; auth logs exposed email identifiers

**Original severity:** High  
**Fix:** Added Zod schemas for enable/verify operations, applied authentication limiting to verification, and removed email values from failed-login/security log payloads.  
**Verification:** Backend 179-test suite passes.  
**Remaining risk:** Add dedicated distributed brute-force and log-redaction integration tests.

### F-05 — Portal token persistence was inconsistent and exposed tokens longer than needed

**Original severity:** High  
**Fix:** Consolidated portal API token lookup around the active session, migrated legacy state, removed local token persistence, and removed a page-level localStorage token dependency.  
**Verification:** Portal type check and production build pass.  
**Remaining risk:** Portal has no automated authentication tests; staff localStorage risk remains as H-07.

### F-06 — High-severity npm dependency finding in DICOM archive path

**Original severity:** High  
**Fix:** Applied safe audit updates and overrode `adm-zip` to 0.6.0 beneath `dcmjs`; verified the resolved tree.  
**Verification:** Backend full/production audits report zero vulnerabilities and PACS upload tests pass.  
**Remaining risk:** This transitive override needs ongoing compatibility/security tracking and should be removed when upstream adopts a fixed version.

### F-07 — Backend could continue after unknown promise rejection

**Original severity:** High  
**Fix:** Structured fatal logging and process termination were added for unhandled rejections and uncaught exceptions; Compose restart policy was added.  
**Verification:** Backend tests pass; source and Compose validation pass.  
**Remaining risk:** H-08 remains until shutdown is fully graceful.

### F-08 — Production CORS implicitly trusted localhost

**Original severity:** Medium  
**Fix:** Development localhost origins are excluded when `NODE_ENV=production`; production uses only explicitly configured URLs/origins.  
**Verification:** Backend tests and local development runtime pass.  
**Remaining risk:** Production staging must verify the exact HTTPS origin list and proxy behavior.

### F-09 — Local launcher and root script referenced the removed `old_portal` path

**Original severity:** Medium  
**Fix:** Updated launcher and root scripts to `portal/`.  
**Verification:** Portal launches and returns HTTP 200 on port 5174.  
**Remaining risk:** Source-tree provenance remains blocked by B-01.

### F-10 — Frontend lint and unit regressions

**Original severity:** Medium  
**Fix:** Corrected hook dependencies/memoization, redundant coercion, JSX whitespace, mixed-export lint handling, optional translation access, and two brittle tests.  
**Verification:** ESLint passes with zero warnings; 92 tests and production build pass.  
**Remaining risk:** Coverage/E2E gaps remain.

### F-11 — Container/runtime baselines were weak

**Original severity:** Medium  
**Fix:** Updated Node baseline to 20.19, made the backend container run as the `node` user, corrected volume ownership, changed Compose default to production, and added restart/health dependency behavior.  
**Verification:** Compose configuration passes.  
**Remaining risk:** Images were not built because Docker was unavailable.

### F-12 — CI omitted portal and database-backed release checks

**Original severity:** Medium  
**Fix:** Restored the workflow with portal install/type/build, production dependency audits, Compose validation, PostgreSQL service, complete fresh migration, and 44-check deployment validation.  
**Verification:** Equivalent local commands pass.  
**Remaining risk:** M-03 remains and remote GitHub execution cannot be proven without repository provenance.

### F-13 — Frontend/backend development audit findings

**Original severity:** Medium  
**Fix:** Applied non-breaking `npm audit fix` updates and refreshed lockfiles.  
**Verification:** Backend is clean; frontend/portal retain only the documented moderate React Router production advisories.  
**Remaining risk:** M-01.

### F-14 — Production startup and container health were not sufficiently fail-safe

**Original severity:** Low  
**Fix:** Production now requires explicit origins/scanner/backup keys through validation; backend health and dependent service ordering were added.  
**Verification:** Environment validation, Compose rendering, health endpoints, and local runtime pass.  
**Remaining risk:** Production topology still requires H-01/H-02 verification.

## Changes Made During Review

- Fixed AI study eligibility and added two safety tests.
- Fixed financial business-date normalization and added a regression test.
- Updated the live deployment validation harness for current idempotency, roles, refund lifecycle, and DB date semantics.
- Added 2FA input validation/rate limiting and reduced authentication-log PII.
- Removed persistent portal bearer-token storage and corrected portal path references.
- Repaired frontend lint/test failures.
- Updated dependency lockfiles, removed safe-to-fix audit findings, and added the DICOM transitive override.
- Updated Node/container baselines, non-root backend execution, restart policies, readiness ordering, production defaults, and CORS behavior.
- Restored and expanded the CI quality-gate workflow.
- Generated local build and coverage artifacts and restored the local development services after verification.

## Required Release Gates

Release must remain blocked until every item below is evidenced against one immutable commit:

1. Recover/recreate a trustworthy Git repository, reconcile the review changes, restore owned documentation, and approve a protected release commit.
2. Revoke and rotate all current credentials; configure managed production secrets, exact HTTPS origins/public URLs, backup encryption, and a working ClamAV executable.
3. Build and run every image from the release commit in staging; pass health, restart, volume permission, PACS/OHIF/DICOM, AI-profile, and network exposure tests.
4. Remediate H-03 through H-09 or obtain explicit, time-bounded security/risk-owner acceptance with compensating controls.
5. Add portal tests and high-risk browser E2E coverage; raise backend coverage around auth, privacy, upload, clinical, and financial paths.
6. Perform load tests for API, DB pool, PACS upload, queues, reports, and concurrent financial operations.
7. Demonstrate TLS at the public edge, centralized monitoring/alerts, log retention/redaction, on-call response, and graceful rolling deployment.
8. Complete encrypted backup and restore rehearsal, document RPO/RTO, and rehearse application/database rollback.
9. Complete Python/SBOM/license/secret/SAST/container vulnerability scans and resolve or formally accept results.
10. Obtain security, privacy/legal, operations, product, and qualified clinical/regulatory sign-off.

## Rollback Recommendation

Do not deploy the reviewed directory directly. Once a trusted repository and staging release exist, use an immutable versioned artifact, take and verify an encrypted pre-deployment backup, prefer backward-compatible expand/migrate/contract database changes, retain the prior application artifact, and define objective rollback triggers. Because database downgrade scripts are not established, rollback should normally restore the prior application against a backward-compatible schema; destructive database restoration must be an explicitly approved last resort with measured data-loss bounds.

## Final Decision

**NOT READY FOR PRODUCTION**

The green automated and database results are meaningful, and the repaired core is a strong basis for staging. They do not override the two release blockers or the unresolved high-severity security and operational risks. Production approval requires a repeatable review of an immutable source commit in a production-like environment.
