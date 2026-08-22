# VIARA Deployment Checklist

Use this checklist for staging and production releases of VIARA.

## 1. Release Inputs

- [ ] Confirm the release branch and tag/commit SHA.
- [ ] Confirm the target environment: staging or production.
- [ ] Confirm the deployment window and owner.
- [ ] Confirm rollback owner and backup owner.

## 2. Secrets and Configuration

- [ ] Set `POSTGRES_PASSWORD` in the secret store.
- [ ] Set `JWT_SECRET` in the secret store.
- [ ] Set `ENCRYPTION_KEY` in the secret store.
- [ ] Set `BACKUP_ENCRYPTION_KEY` in the secret store.
- [ ] Set `BLIND_INDEX_KEY` in the secret store.
- [ ] Set `ORTHANC_PASSWORD` in the secret store.
- [ ] Set `PACS_WEBHOOK_SECRET` in the secret store.
- [ ] Set `CLIENT_URL` to the public HTTPS staff URL.
- [ ] Set `PORTAL_CLIENT_URL` to the public HTTPS portal URL.
- [ ] Set `PORTAL_PUBLIC_URL` to the public HTTPS portal URL.
- [ ] Set `ALLOWED_ORIGINS` to the exact approved browser origins.
- [ ] Verify `NODE_ENV=production` for production.
- [ ] Verify no fallback development values are used in production.

## 3. Pre-Deploy Validation

- [ ] Run `docker compose config --quiet`.
- [ ] Run backend dependency install with `npm ci`.
- [ ] Run frontend dependency install with `npm ci`.
- [ ] Run portal dependency install with `npm ci`.
- [ ] Run backend tests.
- [ ] Run frontend lint and tests.
- [ ] Run portal type check and build.
- [ ] Run dependency audit for production packages.
- [ ] Run database migrations on a fresh staging database.
- [ ] Confirm all required health checks pass in staging.

## 4. Deployment Order

- [ ] Deploy database service first.
- [ ] Deploy ClamAV scanner next.
- [ ] Run database migrations.
- [ ] Deploy backend API.
- [ ] Deploy frontend staff app.
- [ ] Deploy patient portal.
- [ ] Deploy Orthanc and verify DICOM access if required.
- [ ] Deploy OHIF viewer if included in the release.
- [ ] Deploy PACS AI worker only if explicitly enabled.

## 5. Post-Deploy Smoke Tests

- [ ] Confirm backend readiness endpoint returns OK.
- [ ] Confirm frontend loads successfully in a browser.
- [ ] Confirm portal loads successfully in a browser.
- [ ] Confirm login works for a valid account.
- [ ] Confirm logout invalidates the session.
- [ ] Confirm a read-only patient workflow works end to end.
- [ ] Confirm file upload succeeds for an allowed file type.
- [ ] Confirm malware scan and upload size limits still apply.
- [ ] Confirm PACS/Orthanc readiness if the imaging stack is enabled.
- [ ] Confirm logs contain no secrets or stack traces.

## 6. Operational Checks

- [ ] Confirm backup schedule is enabled.
- [ ] Confirm backup encryption is enabled.
- [ ] Confirm disk capacity has adequate headroom.
- [ ] Confirm health checks are monitored.
- [ ] Confirm alerts are active for app and database failures.
- [ ] Confirm public services are behind HTTPS.
- [ ] Confirm Postgres is not exposed publicly.
- [ ] Confirm Orthanc REST is not exposed publicly.

## 7. Rollback Checklist

- [ ] Stop the new release containers.
- [ ] Restore the previous image tags or release version.
- [ ] Re-run health checks after rollback.
- [ ] Restore the database from the latest known-good backup if needed.
- [ ] Document any migration that cannot be automatically reversed.
- [ ] Record the incident and the reason for rollback.

## 8. Release Sign-Off

- [ ] Deployment owner has signed off.
- [ ] Validation owner has signed off.
- [ ] Rollback owner has signed off.
- [ ] Production monitoring is green for the observation period.

## Notes

- Prefer immutable image tags for production.
- Do not store secrets in `.env` files on the production host.
- Keep staging as close to production as possible.
- Do not promote a release if any required smoke test fails.