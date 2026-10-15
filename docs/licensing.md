# VIARA — License Management Guide

> Last updated: September 2026

---

## Overview

VIARA uses an **ECDSA P-256 signed license** system. Every deployed instance must have a valid `LICENSE_KEY` in its `.env` file. The server refuses to start in production without one.

---

## License Editions

| Edition | Target | Modules |
|---------|--------|---------|
| `trial` | Pre-sale evaluation (30 days) | Appointments, Patients, Reception, Display, Chat, Notifications, Profile |
| `standard` | Small–medium centers | + Finance, Insurance, HR, Import, Backup, CRM, Inventory |
| `enterprise` | Multi-branch / hospital systems | + PACS, Analytics, SSO, Multi-branch |
| `developer` | Local development only | All (no expiry, no hardware binding) |

---

## Generating Keys (Vendor Only)

### 1. Generate the ECDSA Keypair (one-time)

```bash
node scripts/generate-keypair.js
```

This creates:
- `keys/privateKey.pem` — **NEVER commit. Keep in a secure vault.**
- `keys/publicKey.pem` — Embed in `licenseService.js` (already done for current key)

> ⚠️ **Security rule**: `keys/` is in `.gitignore`. Rotate keys only between major releases.

---

### 2. Issue a License for a Customer

**Guided (recommended).** Running the script with no arguments walks through every
field step by step and prints a summary before signing:

```bash
node scripts/generate-license.js
```

```
Step 1/7 — Customer identifier (e.g. AL-NOOR-RADIOLOGY) [ORG-086303]:
Step 2/7 — Select edition [trial]:
  Available editions:
    1) Trial        Time-limited evaluation with tight quotas
    2) Standard     Full single-branch production license
    3) Enterprise   Multi-branch, SSO, advanced analytics
    4) Developer    Internal development mode, no hardware binding
Step 3/7 — Validity in days (0 or "perpetual" for no expiry) [30]:
Step 4/7 — Maximum users ("u" for unlimited) [3]:
Step 5/7 — Lock to a hardware fingerprint ("none" to bind on first activation) [none]:
Step 6/7 — Allowed modules (comma-separated, or "default" for edition defaults) [default]:
Step 7/7 — Generate and sign this license? (y/N):
```

Invalid input re-asks the same step instead of failing, and pressing `Ctrl+C`
aborts without writing anything.

**Non-interactive** — for scripts, CI, and repeatable issuance:

```bash
node scripts/generate-license.js \
  --customer "CLINIC-0042" \
  --edition trial \
  --days 30 \
  --max-users 5
```

Options:

| Flag | Description | Default |
|------|-------------|---------|
| `--customer` | Customer/clinic ID (2–64 chars: letters, digits, `.`, `-`, `_`) | generated `DEMO-*` |
| `--edition` | `trial` / `standard` / `enterprise` / `developer` | `trial` |
| `--days` | Validity period in days; `0` means perpetual | edition default (trial 30, standard 365, enterprise/developer 0) |
| `--expires` | Explicit expiry date (`YYYY-MM-DD` or ISO); wins over `--days` | — |
| `--max-users` | Maximum concurrent active users, or `-1`/`u` for unlimited | `3` trial, `25` standard, unlimited enterprise+ |
| `--modules` | Comma-separated allowed module list | Edition default |
| `--fingerprint` | Pre-bind to a machine fingerprint (64 hex chars, SHA-256) | None (auto-binds on first run) |
| `--verify` | Verify and decode an existing key, then exit | — |
| `--out` | Write the key to a file | stdout |
| `--env` | Write or update `LICENSE_KEY=` inside a `.env` file | — |
| `--yes` | Skip the confirmation prompt | off |
| `--help` | Show usage | — |

A `trial` license must expire — `licenseService.js` rejects a perpetual trial, so
the script refuses `--days 0` for that edition rather than emitting a key the
backend will reject.

Use `--env` to write the key straight into a client `.env`; other variables in the
file are preserved and an existing `LICENSE_KEY` is replaced in place:

```bash
node scripts/generate-license.js \
  --customer "CLINIC-0042" \
  --edition standard \
  --days 365 \
  --env .env
```

To confirm a key later:

```bash
node scripts/generate-license.js --verify "eyJwYXlsb2FkI..."
```

---

### 3. Customer Installation

The customer adds to their `.env`:

```bash
LICENSE_KEY=eyJwYXlsb2FkI...   # from the license issuance step
```

On first server start:
1. The license signature is verified against the embedded public key
2. The machine's hardware fingerprint (MAC + CPU + Hostname hash) is saved to `.viara-activation`
3. Subsequent starts compare the current fingerprint against the saved one

> **Moving to a new server?** Delete `.viara-activation` and restart — the license will re-bind to the new hardware automatically (within a 1-reactivation grace window).

---

## Trial Edition Constraints

| Constraint | Limit |
|------------|-------|
| Duration | 30 days from issuance |
| Patients | 50 total |
| Appointments | 100/month |
| Active users | Per `maxUsers` in license (default 3) |
| Reports/day | 10 |
| API rate limit | 200 req/15min (vs 1000 standard) |

### Features locked in Trial

- Finance & Invoicing (`/financials`)
- Insurance Management (`/insurance`)
- HR & Payroll (`/hr`, `/payroll`)
- PACS / DICOM (`/pacs`, `/modality`)
- Advanced Analytics (`/analytics`)
- Backup & Export (`/api/backups`)
- Bulk Import (`/api/import`)
- CRM & Marketing (`/crm`)
- Inventory (`/inventory`)

The Sidebar shows locked items with a 🔒 badge. Accessing a locked page shows the `FeatureLocked` upgrade screen.

---

## License Expiry Behaviour

| State | Backend | Frontend |
|-------|---------|----------|
| > 7 days left | Normal | Blue `TrialBanner` |
| 3–7 days left | `X-Trial-Warning` header | Yellow `TrialBanner` |
| 1–3 days left | `X-Trial-Warning` header | Red `TrialBanner` |
| Expired | `402 Payment Required` on all routes | Banner shows "انتهت الصلاحية" + contact CTA |

---

## License Ping Job

The `licensePingJob` runs every 24 hours to:
1. Re-validate the license locally (expiry + fingerprint)
2. (Optional) PING a cloud license server at `LICENSE_PING_URL`

Failure handling:
- ≥ 3 consecutive failures → `WARN` log
- ≥ 7 consecutive failures → Read-only advisory mode (server stays up but warns)

Disable for air-gapped installs:
```bash
LICENSE_PING_ENABLED=false
```

---

## Trial Analytics (Sales Team)

All trial activity is tracked in the `trial_analytics_events` table.

**Endpoint (Admin only):**
```
GET /api/admin/trial-analytics
```

Returns:
- Actions last 7 days
- Daily active users
- Top 5 blocked features (conversion signals)
- Engagement score (0–100)

---

## Rotating Keys

1. Run `node scripts/generate-keypair.js` to get a new keypair
2. Update `licenseService.js` `LICENSE_PUBLIC_KEY_PEM` with the new public key
3. Re-issue all existing customer licenses with the new private key
4. Deploy the updated backend — old license keys will be **invalid** after rotation

> Schedule key rotation with a customer communication plan (minimum 30-day notice).

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `LICENSE_KEY` | ✅ Yes | Signed license payload (base64url) |
| `LICENSE_PUBLIC_KEY` | ❌ Optional | Override embedded public key |
| `LICENSE_PING_INTERVAL_MS` | ❌ Optional | Ping interval ms (default: 86400000) |
| `LICENSE_PING_URL` | ❌ Optional | Cloud license server URL |
| `LICENSE_PING_ENABLED` | ❌ Optional | Set `false` to disable ping job |
| `UPGRADE_URL` | ❌ Optional | Upgrade CTA URL in banners |
| `SALES_CONTACT_URL` | ❌ Optional | Sales contact URL in banners |
| `VITE_UPGRADE_URL` | ❌ Optional | Frontend upgrade URL |
| `VITE_SALES_CONTACT_URL` | ❌ Optional | Frontend sales contact URL |
