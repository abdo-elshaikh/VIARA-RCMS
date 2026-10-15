# PACS / OHIF Remediation Status (verified against code)

**Date:** 2026-10-07
**Supersedes:** the findings list of the 2026-10-03 PACS/OHIF/Orthanc review
(that working-tree file was removed from the repository; this is the retained
single source of truth).
**Method:** direct code inspection of the paths named below. This is a
status-and-evidence record, not a new functional claim. Items marked
**Needs verification** were not confirmed by direct evidence and must be proven
on a running system before being called closed.

> This document exists to keep audit documentation aligned with the code, which
> the production-readiness assessment flagged as a recurring risk.

## Closed — evidence in code

| ID | Finding | Evidence |
| :-- | :--- | :--- |
| **F03** | Viewer session not tied to login | `backend/src/middleware/authMiddleware.js:210-226` (`acceptViewerSession` checks `current_session_id`, `is_active`, `must_change_password`, role); `backend/src/controllers/pacsController.js:1829-1842` (10-minute TTL, `session_id`, `parent_session_expires_at`); logout clears cookie `backend/src/controllers/authController.js:625` |
| **F04** | Encrypted Orthanc password breaks auth | Unified `orthancConnectionService.getOrthancConnection`; `backend/src/services/pacsModalityRegistryService.js:15,49-58` consumes it (no fixed fallback) |
| **F05** | Ambiguous auto-match may pick wrong exam | `backend/src/services/pacsReconcileService.js:213-278` — every branch uses `LIMIT 2` and returns `{ ambiguous: true }` → quarantine |
| **F06** | DB backup omits Orthanc images | `backend/src/services/postgresBackupService.js:267-272` (`snapshotPacs` → `.pacs.zip.enc`); restore path `:411`; verify `:379` |
| **F07** | Reconciliation jobs stuck `processing` | `backend/src/services/pacsReconciliationQueue.js:69-71` (expired-lease reaper), `:104-109` (heartbeat), `:75-76` (attempts + exponential backoff, max 5) |
| **F08** | Orthanc event delivery unreliable | `backend/src/services/pacsArchiveSyncService.js:16-37` (persistent `pacs_sync_cursors`, sequence-reset handling); wired in `pacsReconciliationQueue.js:159` |
| **F09** | Manual upload rewrites patient identity | `backend/src/services/pacsReconcileService.js:189-211` (`validateReconcileTarget` blocks a source/target MRN mismatch → quarantine); `:348-352` (`pg_advisory_xact_lock` on the series UID then throws `series UID already belongs to another study` when it conflicts); `:304-305` (archive identity conflict throws). Compares MRN, not PatientName |
| **F10** | OHIF sub-path embed/deploy mismatch | `frontend/nginx.conf.template:42-72` (sub-path rewrite + asset rewriting); `pacs/ohif/app-config.js:92` (`routerBasename` derived from pathname) |
| **F11** | One cookie per study causes tab conflicts | No shared cookie: viewer token lives in per-tab `sessionStorage` and is sent as a Bearer header — `pacs/ohif/app-config.js:138-145`; `createViewerSession` sets no cookie (`pacsController.js:1843-1852`) |
| **F12** | Partial/failed upload shown as success | `frontend/src/pages/ReportEditorPage.jsx:399-403` distinguishes failure; success toast only on linked images |
| **F13** | Report read from wrong response shape | `frontend/src/pages/PacsViewer.jsx:590-601` reads `data.exam || data`, uses `AbortController`, clears state |
| **F16** | Export buffers whole study in memory | `backend/src/services/pacsExportService.js:203` streams via `pipeline(Readable.from(createStoredZipStream(...)), res, { signal })`; `backend/src/controllers/pacsController.js:1775-1795` streams and aborts on client disconnect |
| **F17** | AI job status mismatch | `frontend/src/pages/ReportEditorPage.jsx:228` polls `Queued`/`Running` |
| **F18** | "Cold" tiering was bookkeeping only | `backend/src/services/pacsTieringService.js:36` requires a verified `fileRef` + `checksum`, marks tier `warm` (not `cold`) |
| **F15** | Multi-frame preview/export covers all frames | `frontend/src/utils/analyzeDisplaySets.js:75-80,90` expands each instance into `NumberOfFrames` (00280008) entries with `__frameNumber`; the viewport navigates per frame (`frontend/src/pages/PacsViewer.jsx:1739-1745`); export enumerates every frame (`backend/src/services/pacsExportService.js:178-185`). Covered by `frontend/src/utils/__tests__/pacsReliability.test.js:17-28` |
| **F19** | Upload batch limits (count vs total bytes) | `frontend/src/components/reportEditor/utils.js:5-21` — rejects any file > 25 MiB pre-flight and splits batches by both count (10) and cumulative bytes (190 MiB); `backend/src/routes/pacsRoutes.js:55-57,79-84` — multer `fileSize` 25 MiB, `files` 20, `parts`, plus aggregate `PACS_MAX_REQUEST_BYTES` (200 MiB) rejected at `:100,:108` |
| **F20** | Viewer UI can't tell iframe from image success | `pacs/ohif/nginx.conf:50-53` (`/health/ready` proxy); `pacs/ohif/app-config.js:42-71` postMessage `ready`/`error` handshake |

## Tracked config (already hardened)

| ID | Item | Evidence |
| :-- | :--- | :--- |
| **F02** | DICOM query/worklist open to unregistered peers | `pacs/orthanc/orthanc.json:9-15` (`DicomAlwaysAllowFind/FindWorklist/Store=false`, `DicomCheckModalityHost=true`); all composes bind `${PACS_DICOM_BIND:-127.0.0.1}` |
| **F01** | OHIF→backend path in mixed host/Docker mode | `docker-compose.local-pacs.yml` (`host.docker.internal:3000`); OHIF readiness proxies `/health/ready` (`pacs/ohif/nginx.conf:50-53`) — **Needs verification** on a running mixed-mode stack |

## Needs verification (no direct evidence gathered)

| ID | Item | Why open |
| :-- | :--- | :--- |
| **F02** | Running container values | Source is hardened; confirm `docker inspect` / Orthanc `/system` on the **running** container matches, and that modalities use the interface bind |
| **F14** | Series preview relies on limited QIDO fields | Not confirmed against real Orthanc responses |

Both remaining items require a running stack; no code change closes them.

## Remote access

The one P0 deliverable that was genuinely absent — the secure remote-access
layer — is now provided as a deployable kit:

- `deploy/remote-access/` — three-tier topology (public portal / clinical mTLS + WireGuard / on-prem), nginx edge configs, WireGuard templates, Cloudflare Tunnel template, and acceptance verifiers for Linux (`.sh`) and Windows (`.ps1`).
- `docs/REVERSE_PROXY_TLS.md` and `docs/CLIENT_DEPLOYMENT_OPERATIONS_AR.md` link to it.

## Verification commands (executed)

From `backend/`:

```bash
npx jest tests/pacs-reliability.test.js tests/pacs-archive-sync.test.js \
         tests/pacs-viewer-session.test.js tests/pacs-measurements.test.js \
         tests/pacs-matching.test.js --runInBand
```

From `frontend/`:

```bash
npx vitest run src/utils/__tests__/pacsReliability.test.js
```

Result on 2026-10-07: backend **5 suites / 31 tests passed**, frontend
**1 file / 3 tests passed**, 0 failed. Together these exercise F03 (session
revocation + renewal), F05 (ambiguous accession/study/MRN matches quarantine
instead of auto-linking), F07 (dedupe + expired-lease recovery), F08 (archive
sync cursor), F15 (multi-frame expansion + export of every frame), F16
(streamed export), and F19 (upload batch limits by count and bytes). Remaining
items in *Needs verification* require a running stack and were not exercised
here.

## Operating-only remainder

These require a running environment and cannot be closed by code inspection:

1. Confirm running Orthanc DICOM values and set `PACS_DICOM_BIND` to the modality LAN/VPN interface.
2. Run the remote-access verifiers on staging (`verify-remote-access.sh` / `.ps1`).
3. Execute performance scenarios and attach reports to the release record.
4. Perform a full restore drill (PostgreSQL + `.pacs.zip.enc`) that opens real images in OHIF.
5. Independent security review / penetration test.
6. Cut a release from a clean Git tree (the working tree currently holds many uncommitted changes).