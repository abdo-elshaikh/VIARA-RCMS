# VIARA Deployment & Client Handover Checklist

Use one copy per environment/release (staging, production, or customer site). Mark items N/A only with a short reason. Do not put passwords, license keys, patient information, or other secrets in this checklist.

For step-by-step customer instructions, see the [Client Deployment & Operations Guide (Arabic)](CLIENT_DEPLOYMENT_OPERATIONS_AR.md).

## Deployment Record

| Field | Value |
|---|---|
| Customer / site / branch | |
| Environment | |
| VIARA release version / package ID | |
| Image tags or source commit SHA | |
| Deployment date and timezone | |
| Deployment owner | |
| Customer technical owner / alternate | |
| Database owner / backup owner | |
| Rollback decision owner | |
| Maintenance window | |
| Change / ticket reference | |

## 1. Release and Environment Readiness

- [ ] Confirm this is a vendor-approved release package, not a development checkout or unreviewed branch.
- [ ] Verify release version, source, image tags, and checksum/signature when supplied.
- [ ] Confirm supported deployment architecture (Linux host, Linux VM on Windows Server, or vendor-approved alternative).
- [ ] Confirm target capacity, permanent storage, free disk headroom, and expected PACS growth.
- [ ] Confirm the change window, customer notification, deployment owner, validation owner, backup owner, and rollback decision owner.
- [ ] Confirm a staging environment representative of the target exists and release-specific checks passed there.
- [ ] Review release notes, supported upgrade path, required migrations, known issues, and rollback constraints.
- [ ] Confirm every VIARA image reference is vendor-approved and pinned to the release; confirm mounted configuration files and release artifacts are in the delivered package.
- [ ] Inspect the final archive manifest; exclude local `.env`, activation state, private keys, unapproved license payloads, logs, caches, and development-only artifacts.
- [ ] Confirm every migration named by the release migration manifest is included in the package/image and the exact artifact migrates a clean staging database.
- [ ] Confirm public frontend build artifacts do not include source maps unless their publication has been explicitly approved.
- [ ] Confirm Docker Engine and Compose versions meet the vendor's release requirements.

## 2. Customer Network, DNS, and Storage

- [ ] Confirm staff application URL, patient/doctor portal URL, API routing, and OHIF routing.
- [ ] Confirm DNS resolution from staff workstations and the modality network.
- [ ] Install and verify trusted TLS certificates for every browser-facing origin, including internal PKI roots for air-gapped sites.
- [ ] Confirm `CLIENT_URL`, `PORTAL_CLIENT_URL`, `PORTAL_PUBLIC_URL`, `ALLOWED_ORIGINS`, `WEBAUTHN_ORIGIN`, and `WEBAUTHN_RP_ID` match the approved production origins.
- [ ] Confirm proxy forwarding headers, WebSocket behavior, upload limits, and timeouts against the release's actual routes.
- [ ] Confirm database, PACS, uploads, and backup data use persistent storage with capacity monitoring.
- [ ] Preserve and protect the `license_data` volume containing the activated license and hardware binding; include it in the approved backup/restore procedure.
- [ ] Confirm Compose project name, volume names, and persistent mount paths will remain stable across upgrades.
- [ ] Confirm PostgreSQL and Orthanc REST are not reachable from public or staff-user networks.
- [ ] Confirm backend, frontend, portal, OHIF, and other internal service ports are only reachable from approved proxy/management networks.
- [ ] Restrict DICOM TCP access to approved modality/VPN source addresses; record server IP, port, and AE Title.
- [ ] Confirm firewall rules were tested from both an authorized and an unauthorized source.
- [ ] Confirm the effect of Docker-published ports on the host firewall was explicitly checked.

## 3. Secrets, Licensing, and Initial Accounts

- [ ] Store database, JWT, encryption, blind-index, backup-encryption, Orthanc, and PACS webhook secrets in an approved secrets manager.
- [ ] If a protected `.env` file is the approved deployment mechanism, restrict filesystem access, exclude it from source control/backups shared broadly, and protect its recovery copy.
- [ ] Confirm `ENCRYPTION_KEY` and `BLIND_INDEX_KEY` match the existing data set; do not regenerate them during an upgrade.
- [ ] Store a recoverable copy of required keys separately from the server and encrypted database backups.
- [ ] Confirm `NODE_ENV=production` and that all placeholder, development, and sample values are removed.
- [ ] Confirm the signed license belongs to the customer/site, is valid for the installed version, and includes the contracted edition/modules/limits.
- [ ] Confirm offline license operation or license-server connectivity as required by the customer environment.
- [ ] Confirm the release contains no hard-coded demo/default credentials or startup output that prints credentials.
- [ ] Confirm no sample/demo users or data are enabled in the production database unless explicitly approved and clearly isolated.
- [ ] Create a named initial customer administrator through the approved bootstrap procedure; change any temporary credential immediately.
- [ ] Create named user accounts with least-privilege roles; do not use Developer/Admin as daily accounts.
- [ ] Test account deactivation, role review, and the approved administrative recovery procedure.

## 4. Pre-Deployment Validation (Release Owner)

- [ ] Validate the resolved deployment configuration with `docker compose config --quiet`.
- [ ] Keep any rendered Compose configuration private; it may contain resolved secrets.
- [ ] Run the release CI/build, backend tests, frontend lint/tests, portal type check/build, and production dependency/security checks.
- [ ] Apply and verify database migrations in staging using the exact release artifact.
- [ ] Test upgrade behavior using a representative staging database and a rollback rehearsal where supported.
- [ ] Confirm application readiness/health checks and expected container resource limits.
- [ ] Confirm ClamAV readiness and upload-scanning behavior.
- [ ] Confirm logs and diagnostics do not disclose secrets or unnecessary patient data.
- [ ] Confirm no test-only seed/reset/fresh-migration operation is in the production deployment path.

## 5. Pre-Upgrade Backup and Recovery Readiness

- [ ] Record current deployed version, image tags, container status, migration level, and relevant configuration version.
- [ ] Create an encrypted PostgreSQL backup and confirm it completed successfully.
- [ ] Create a consistent backup/snapshot for Orthanc/DICOM storage, upload files, and other persistent application data.
- [ ] Copy backups off the application host to the approved protected location.
- [ ] Confirm the required decryption keys and restore procedure are available to authorized recovery staff.
- [ ] Confirm the latest restore drill and measured RPO/RTO meet customer requirements.
- [ ] Verify sufficient free disk space for the upgrade, temporary files, and rollback.
- [ ] Confirm the customer owner understands possible data loss if a pre-upgrade backup is restored.

## 6. Deployment / Upgrade Execution

- [ ] Enter the approved maintenance window and notify users.
- [ ] Use the exact release package/image tags validated in staging; do not deploy `latest`.
- [ ] Keep customer environment configuration and secrets separate from release files.
- [ ] Start or verify PostgreSQL and ClamAV before application services as required by the release.
- [ ] Run migrations once, in the documented order; do not run parallel migration commands.
- [ ] Never use `node database/migrate.js --fresh` or any destructive schema reset against customer data.
- [ ] Deploy backend, staff frontend, portal, Orthanc, OHIF, and optional workers according to the release notes.
- [ ] Record command outcomes, timestamps, migration results, and any deviation without recording secret values.
- [ ] Verify all required services become healthy before reopening access to users.

## 7. Post-Deployment Acceptance Tests

- [ ] Backend readiness endpoint succeeds through the approved internal path.
- [ ] `docker compose ps` shows required services healthy/running with no unexpected restart loops.
- [ ] Staff interface and portal load using trusted HTTPS certificates.
- [ ] License page reports the correct customer, edition, modules, limits, and validity.
- [ ] Named staff login/logout and authorization behave as expected; session/logout behavior is verified.
- [ ] A read-only patient/appointment workflow succeeds using authorized test data.
- [ ] A permitted upload succeeds and malware scanning remains enabled.
- [ ] Existing patient data can be read/decrypted and searched; no key-related errors occur.
- [ ] A prior report/image can be retrieved through the approved workflow.
- [ ] PACS is enabled only if licensed/required; Orthanc readiness and prior-study retrieval are verified.
- [ ] DICOM C-ECHO and a permitted test study succeed from an approved modality network.
- [ ] A new encrypted backup completes and is copied to the protected secondary location.
- [ ] Monitoring/alerts show no sustained errors; logs were reviewed and sanitized.
- [ ] An unauthorized network source cannot reach protected service ports.
- [ ] Customer representative has completed acceptance and documented any approved exceptions.

## 8. Operational Handover

- [ ] Assign customer owners for application administration, infrastructure, database, PACS, backups, security incidents, and vendor escalation.
- [ ] Document staff/portal URLs, DICOM endpoint/AE Title, release version, service window, and support contacts (no secrets).
- [ ] Document backup contents, schedule, retention, off-site target, encryption-key custodian, and restore procedure.
- [ ] Document monitoring/alert channels, disk thresholds, and response expectations.
- [ ] Document certificate renewal owner and expiry monitoring.
- [ ] Document account provisioning/deprovisioning and periodic access-review cadence.
- [ ] Document patching schedule and process for operating system, Docker, and VIARA releases.
- [ ] Document RPO, RTO, maintenance window, and disaster-recovery escalation path.
- [ ] Train administrators on safe logs, service restart, backup verification, and prohibited destructive commands.
- [ ] Obtain customer sign-off and record date, approver, and outstanding risks.

## 9. Rollback and Incident Checklist

- [ ] Stop further rollout and preserve relevant logs/diagnostics without exposing PHI or secrets.
- [ ] Decide whether the prior application image is compatible with the migrated database; consult release notes/vendor before rollback.
- [ ] Restore the prior immutable image/package only when schema compatibility is confirmed.
- [ ] If database restore is required, use the approved restore runbook and obtain data-owner approval for the rollback point.
- [ ] Restore matching PostgreSQL, Orthanc/DICOM, uploads, and other persistent data from a coordinated recovery point as required.
- [ ] Do not assume restoring PostgreSQL alone restores imaging data or yields a consistent PACS state.
- [ ] Do not run `docker compose down -v`, delete volumes, reset schemas, or change encryption keys as a troubleshooting shortcut.
- [ ] Re-run readiness, authentication, patient-data, report, PACS/DICOM, and backup checks after recovery.
- [ ] Notify customer stakeholders and vendor support; record impact, timeline, data-loss assessment, and corrective actions.

## 10. Ongoing Operations

- [ ] Daily: review service health, backup success, storage capacity, and high-severity alerts.
- [ ] Weekly: verify off-site backup freshness, ClamAV signature updates, and unusual access/service failures.
- [ ] Monthly: review access, TLS/license expiry, storage growth, and operating-system/Docker patch status.
- [ ] Quarterly or per customer policy: perform a full restore drill including a representative PACS study.
- [ ] For each release: repeat staging validation, backup, maintenance approval, smoke tests, and rollback planning.

## Release Sign-Off

| Role | Name | Decision / notes | Date |
|---|---|---|---|
| Deployment owner | | | |
| Validation owner | | | |
| Backup / recovery owner | | | |
| Customer system owner | | | |
| Security / privacy approver (if required) | | | |

## Notes

- Keep staging as close to production as practical, but use de-identified test data.
- Prefer immutable, customer-approved release artifacts and pinned image tags.
- Do not put secret values, license strings, patient identifiers, or DICOM files in this checklist or its attachments.
- Keep the release under change control. Do not proceed if a critical acceptance test fails or a required recovery path is unverified.
