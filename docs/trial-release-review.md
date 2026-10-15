# Trial release security review — 2026-10-02

## Changes verified
- License inspection and activation now require Admin or Developer authorization.
- Supplied license signatures are verified in every environment; production cannot fall back to an uninitialized developer license.
- Trials require expiry dates; invalid module lists and user caps are rejected.
- Quota verification failures reject creation with HTTP 503. Signed unlimited user caps are respected.
- Docker passes license and WebAuthn settings. The demo overlay requires a license and uses production mode.
- Build/Git exclusions cover local license files and vendor signing keys.

## Test evidence
- Backend full run: 123 suites, 981 tests passed. Command: npm run test:ci --prefix backend (captured in backend/security-release-final.log)
- Frontend trial-related selection: 6 files, 36 tests passed (watermark, onboarding/state, print components, login).
- Docker Compose merged configuration passed config --quiet using v5.0.1. This is not a deployment or runtime test.
- Read-only preflight verified the local signed trial license. WEBAUTHN_ORIGIN and WEBAUTHN_RP_ID are missing in the root environment file. No secret values were printed or changed.

## Trial baseline
backend/src/config/featureFlags.js is authoritative. Trial includes appointments, patients, reception, display, chat, notifications, profile, HR and finance. HR and finance support reception shifts and billing; older documentation describing them as completely blocked is outdated. Default quotas: 50 active patients, 100 appointments/month, 3 active users (subject to signed license cap), 10 finalized reports/day. Report usage now reads examinations.report_finalized_at instead of the nonexistent exam_reports table; saving drafts does not consume this quota.

## Pending release acceptance
1. Specify customer, duration, user cap, target host and HTTPS domains. No customer-specific release was issued or deployed in this review.
2. Use separate databases/storage and independently generated secrets per prospect. Never seed production.
3. Configure HTTPS CLIENT_URL, PORTAL_CLIENT_URL, ALLOWED_ORIGINS, WEBAUTHN_ORIGIN and RP ID. Configure demo public portal/viewer URLs instead of the provisioner's localhost URLs when deploying behind a proxy.
4. Validate startup, restart persistence, expiry, renewal, direct-API feature restrictions, printed watermarks, backup restoration and cleanup on the target installation.

## Limits
Automated tests use mocked infrastructure and do not prove live TLS or host isolation. Source code on a customer-controlled server can be modified by that administrator; vendor-hosted isolated demos better protect implementation code. The reviewed patient/user creation, appointment creation and report finalization paths now use transaction-scoped PostgreSQL advisory locks covering quota checks and writes. Unit tests cover transaction ordering, rejection and release; cross-process concurrency still requires a real PostgreSQL integration check. Alternative import/reactivation paths must also be assessed before claiming a system-wide hard cap. Hardware activation requires writable persistent storage and a stable host fingerprint; container replacement must be tested before release. No existing data was reset.

## Persistence follow-up
Activation now writes a restricted temporary file and atomically renames it before publishing the in-memory license. A write failure preserves the previous active license. The saved key takes precedence over a stale environment key on restart. Activation no longer rewrites .env files. Docker now mounts project-scoped license_data at /app/license with an image-created directory owned by the non-root node user. Runtime restart and container replacement remain deployment acceptance checks.
