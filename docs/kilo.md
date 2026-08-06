# RCMS Security & Quality Remediation Plan

**Goal:** Fix all 41 findings from the comprehensive security/audit review across the RCMS codebase (backend, frontend, portal, CI/CD, infrastructure).

**Scope:** All source files in `backend/`, `frontend/`, `portal/`, `database/`, `docker-compose.yml`, `.github/workflows/`, and root config files.

**Constraints:**
- No secrets may be committed; `.env` and `backend/.env` are gitignored (verified)
- Maintain backward compatibility with existing database schema where possible
- Preserve all HIPAA/security controls (encryption, audit chaining, RBAC)
- Changes must pass existing CI pipeline (lint, test, build)
- New npm dependencies must be added to `backend/package.json` and installed

**Key facts verified:**
- `backend/node_modules/` exists; `frontend/`, `portal/`, root `node_modules/` do NOT (dev-only workspaces)
- `frontend` is plain JS/JSX — no `tsconfig.json`, no TypeScript. F-DEP-03 is NOT applicable.
- `portal` is TypeScript (`tsconfig.json` exists, `tsc --noEmit` typecheck script exists, typecheck is already in CI).
- `stripe` npm package is NOT installed → must add as backend dependency.
- `opossum` (circuit breaker) is NOT installed → must add.
- `p-limit` is NOT installed → must add.
- `twilio` npm package IS installed (v6.0.2) in backend.
- Two rate limiter files: `middleware/rateLimiter.js` (authLimiter, apiLimiter, strictLimiter) and `middleware/rateLimiters.js` (endpoint-specific: patientDataLimiter, invoiceLimiter, etc.). New limiters go in `rateLimiters.js`.
- PACS webhook route is in `backend/src/routes/pacsRoutes.js:114`, mounted at `server.js:1433` as `/api/pacs/*`.
- `start-services.js` is at the repository root, not inside `backend/`.

---

## Phase 1: Critical Security Fixes

### Task 1.1: Remove hardcoded Orthanc password fallback (T-SEC-01)
**Files:** `backend/src/services/pacsDicomWebService.js:12-28`, `backend/src/services/cloudVisionService.js:955`, `backend/src/services/pacsModalityRegistryService.js:19`, `backend/src/controllers/pacsController.js:583-584`

1. `pacsDicomWebService.js`: Remove `password: 'orthanc'` from `LEGACY_DEFAULTS` object (line 15). In `envPassword` (line 28), change to `process.env.ORTHANC_PASSWORD` — if undefined, throw an error at config time (not just fall back).
2. `pacsModalityRegistryService.js:19`: Replace `process.env.ORTHANC_PASSWORD || 'orthanc'` with `process.env.ORTHANC_PASSWORD` and add a guard: `if (!process.env.ORTHANC_PASSWORD) throw new Error('ORTHANC_PASSWORD is required')`.
3. `pacsController.js:584`: Replace `process.env.ORTHANC_PASSWORD || 'orthanc'` — remove the `'orthanc'` fallback, use just `process.env.ORTHANC_PASSWORD`.
4. `cloudVisionService.js:955`: Same fix — remove any `'orthanc'` fallback.
5. `backend/src/config/validateEnv.js`: Add `ORTHANC_PASSWORD` and `PACS_WEBHOOK_SECRET` to `requiredEnvVars` array (line 8-13) so they're required in ALL environments.

### Task 1.2: Remove hardcoded DB URL fallback (T-SEC-03)
**Files:** `backend/src/server.js:442`, `backend/database/migrate.js:255`

1. `server.js:442`: Replace `process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'` with:
```js
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const connectionString = process.env.DATABASE_URL;
```
2. `migrate.js:255`: Same pattern — throw if missing instead of using the `'admin'` fallback.

### Task 1.3: Move SSE auth token out of URL query parameter (T-SEC-02)
**Files:** `backend/src/services/realtimeService.js:38-50`, `backend/src/server.js:1724`, `frontend/src/App.jsx:341`, `portal/src/pages/DoctorPortal.tsx:95`

1. Create a server-side in-memory `Map<string, { userId, role, patientId, doctorId, expiresAt }>` for SSE session tokens in `realtimeService.js`.
2. Add `POST /api/realtime/session` endpoint in `server.js` that:
   - Requires `authenticateToken` (Bearer JWT)
   - Mints a 5-minute purpose-scoped SSE session token (random 32-byte hex)
   - Stores it in the `Map` with decoded identity and expiry
   - Returns `{ token }`
3. Rewrite `registerClient` in `realtimeService.js` to:
   - Read the session token from `req.query.token` (but now it's a short-lived purpose-scoped token, not the access JWT)
   - Validate it against the `Map`
   - Reject if expired or not found
   - Clean up expired tokens
4. Update `frontend/src/App.jsx:341`: Replace direct `EventSource` with a `fetch` POST to `/api/realtime/session` to obtain the SSE token, then pass it to `EventSource`.
5. Update `portal/src/pages/DoctorPortal.tsx:95`: Same pattern — fetch SSE session token via authenticated POST, then use it for EventSource.
6. Add periodic cleanup interval to remove expired SSE session tokens from the `Map`.

**Note:** The SSE session token will still appear in the URL query param, but this is acceptable because:
- It expires in 5 minutes
- It's purpose-scoped (only grants SSE connection, not API access)
- The user's actual access JWT is never in the URL

### Task 1.4: Remove localStorage token fallback in portal (T-SEC-08)
**Files:** `portal/src/lib/api.ts:18-28`, `portal/src/store/authSlice.ts:24-35,56,64,83`

1. `portal/src/lib/api.ts:20`: Remove `localStorage.getItem("rcms_token")` from `getAuthToken()`. Use only `sessionStorage.getItem("token")`.
2. `portal/src/store/authSlice.ts`:
   - Line 27: Change `getStoredUser` to read from `sessionStorage` instead of `localStorage`
   - Line 56: Remove `localStorage.setItem('user', ...)` — or change to `sessionStorage.setItem('user', ...)`
   - Line 64: Remove `localStorage.removeItem('user')` — or change to `sessionStorage.removeItem('user')`
   - Line 83: Remove `localStorage.setItem('user', ...)` in `updateCurrentUser`

### Task 1.5: Stop persisting user object with permissions in localStorage (frontend + portal)
**Files:** `frontend/src/store/authSlice.js:39,47-48`, `portal/src/store/authSlice.ts:56,83`

**Frontend actions:**
1. `frontend/src/store/authSlice.js:39`: In `setCredentials`, remove `localStorage.setItem('user', JSON.stringify(state.user))` — the user object includes `permissions` which is sensitive. Use `sessionStorage` at most.
2. `frontend/src/store/authSlice.js:47-48`: Change `readStoredUser` and `getStoredUser` to read from `sessionStorage` instead of `localStorage`.

**Portal actions (Task 1.4 covers this):**
- Change all `localStorage.setItem('user', ...)` to `sessionStorage.setItem('user', ...)`
- Change `getStoredUser` to read from `sessionStorage`

### Task 1.6: Stop decoding JWT client-side for identity (T-SEC-07)
**Files:** `portal/src/lib/api.ts:45-58`, add new backend endpoint

1. Replace `getAuthIdentity()` in `portal/src/lib/api.ts` to call a new `/api/profile` endpoint instead of base64-decoding the JWT locally.
2. Add `GET /api/profile` endpoint to `server.js` (guarded by `authenticateToken`) that returns only non-sensitive fields: `{ id, name, email, role, mustChangePassword }` — NO permissions array, NO full JWT claims.
3. Remove the base64-decode logic from `portal/src/lib/api.ts:45-58`.
4. Update all call sites of `getAuthIdentity()` to use the new `/api/profile` endpoint (cache the result in React context or RTK Query).

---

## Phase 2: High-Priority Security Fixes

### Task 2.1: Replace mock webhook validation with official SDKs (T-SEC-04)
**File:** `backend/src/middleware/webhookAuth.js:33, 38-64`

1. Add `stripe` to `backend/package.json` dependencies and run `npm install`.
2. Capture raw request body for Stripe/Twilio webhook routes before `express.json()` consumes it. Add a raw body parser:
```js
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use('/api/webhooks/twilio', express.raw({ type: 'application/x-www-form-urlencoded' }));
```
3. Replace the manual HMAC in `verifyWebhookSignature`:
   - Stripe: `const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, secret)` — catch `SignatureVerificationError`
   - Twilio: Use `twilio.validateExpressRequest(req, authToken, { url: originalUrl, method: req.method })`
4. Remove the `JSON.stringify(req.body)` approach entirely.
5. Store the raw body on `req.rawBody` so the route handler can still access the parsed body if needed.

**Dependencies:** Add `stripe` to `backend/package.json`. `twilio` is already installed.

### Task 2.2: Require BLIND_INDEX_KEY, remove fallback to ENCRYPTION_KEY (T-SEC-05)
**File:** `backend/src/utils/crypto.js:69`

1. `crypto.js:69`: Change `const blindIndexKey = process.env.BLIND_INDEX_KEY || process.env.ENCRYPTION_KEY;` to:
```js
if (!process.env.BLIND_INDEX_KEY) throw new Error('BLIND_INDEX_KEY is required');
const blindIndexKey = process.env.BLIND_INDEX_KEY;
```
2. `validateEnv.js`: Move `BLIND_INDEX_KEY` to `requiredEnvVars` (all environments), remove the production-only check on line 50.
3. Update `.env` and `backend/.env` with a separate `BLIND_INDEX_KEY` value.

### Task 2.3: Complete AES-CBC → AES-GCM migration, remove CBC path (T-SEC-06)
**File:** `backend/src/utils/crypto.js:49-56`

1. Write `backend/scripts/reencryptPii.js` that:
   - Scans all PII-encrypted columns across tables (patients.first_name_enc/last_name_enc, appointments, examinations, etc.)
   - For each value, if it does NOT start with `v2:`, it's legacy CBC — decrypt it and re-encrypt with v2 (GCM)
   - Log progress and any failures
2. Run the script against a development database to verify.
3. Remove the CBC decryption branch in `crypto.js:49-56` (the `else` block at line 49).
4. Add a log warning in `decrypt` if a legacy-format value is encountered (defense-in-depth).

### Task 2.4: Configure strict CSP headers via helmet (T-SEC-11)
**File:** `backend/src/server.js:530`

1. Replace `app.use(helmet())` with:
```js
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // for Tailwind/inline styles
      imgSrc: ["'self'", "data:", "blob:", "https://*"],
      connectSrc: ["'self'", "ws://*", "wss://*"],
      frameSrc: ["'self'", ...getAllowedOrigins().map(o => o.replace(/^http/, 'ws'))], // OHIF iframe + SSE
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));
```
2. Use `getAllowedOrigins()` (already defined at server.js:558) to dynamically set `frameSrc` and `connectSrc` based on configured origins.

### Task 2.5: Extend SSRF validation to all AI providers (T-SEC-09)
**File:** `backend/src/services/aiReportService.js:353`

1. Move `validateCustomAiEndpointUrl(baseUrl)` to apply whenever a `baseUrl` is provided, regardless of provider:
```js
if (baseUrl) validateCustomAiEndpointUrl(baseUrl);
```
2. Enhance `validateCustomAiEndpointUrl` in `backend/src/utils/customAiEndpointUrl.js` to also resolve DNS hostnames (not just literal IPs) and check if the resolved IP is private — preventing DNS rebinding attacks:
```js
const dns = require('dns').promises;
// After URL parsing, if hostname is not a literal IP, do a DNS lookup
const ipVersion = net.isIP(hostname);
if (ipVersion === 0) {
  // It's a hostname, resolve it
  const resolved = await dns.lookup(hostname);
  const resolvedIp = resolved.address;
  if (isProhibitedIpv4(resolvedIp) || ...) {
    throw new TypeError('...');
  }
}
```

### Task 2.6: Add rate limiting to PACS webhook (T-SEC-10)
**Files:** `backend/src/middleware/rateLimiters.js`, `backend/src/routes/pacsRoutes.js:114`

1. Add `pacsWebhookLimiter` to `rateLimiters.js`:
```js
const pacsWebhookLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 60, // 60 webhooks per 5 min per source IP
    message: { error: 'Too many PACS webhook requests' },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});
```
2. Apply to the webhook route in `pacsRoutes.js:114`:
```js
router.post('/webhook', pacsWebhookLimiter, verifyPacsWebhook, handleWebhook(pool));
```
3. Import `pacsWebhookLimiter` in `pacsRoutes.js`.

### Task 2.7: Fix enforcePasswordChange whitelist (T-SEC-14)
**File:** `backend/src/middleware/authMiddleware.js:15`

1. Change the whitelist to only include password-related endpoints:
```js
const whitelistedPaths = new Set([
    '/api/profile',
    '/api/profile/password',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/auth/change-password',
]);
```
2. Remove `/api/settings/center` and `/api/chat/unread-summary`.

### Task 2.8: Fix portal credentials consistency (T-SEC-13)
**File:** `portal/src/lib/api.ts:81`

1. Add `credentials: 'include'` to the `fetch` call at line 81.

### Task 2.9: Add mustChangePassword redirect in portal (L-LOG-04)
**File:** `portal/src/App.tsx:25-32`

1. Add a `mustChangePassword` check to `RequireRole`:
```tsx
if (isAuthenticated && (user as any)?.mustChangePassword) {
    return <Navigate to="/settings?tab=security" replace />;
}
```
2. Ensure the portal has a password-change page/route. Create one if needed (e.g., `portal/src/pages/Settings.tsx` with a password change form).

### Task 2.10: Reject secrets matching common placeholder patterns (T-SEC-12)
**File:** `backend/src/config/validateEnv.js:114-120`

1. Add a weak secret pattern check:
```js
const WEAK_SECRET_PATTERNS = [
    /dev_jwt_secret_change_this/i,
    /dev_blind_index_key_change_this/i,
    /replace_with/i,
    /change_this/i,
];
```
2. In the JWT_SECRET validation block, add:
```js
if (WEAK_SECRET_PATTERNS.some(p => p.test(process.env.JWT_SECRET))) {
    invalid.push('JWT_SECRET appears to be a weak/placeholder value — use a randomly generated secret');
}
```
3. Apply similar checks for `ORTHANC_PASSWORD`, `PACS_WEBHOOK_SECRET`.

### Task 2.11: Update .env with stronger secrets
**File:** `.env`

1. Replace weak secrets with randomly generated values:
   - `POSTGRES_PASSWORD`: generate random 24+ char string
   - `JWT_SECRET`: generate random 64-char hex
   - `BLIND_INDEX_KEY`: generate random 32+ char string
   - `PACS_WEBHOOK_SECRET`: generate random string
   - `PACS_AI_WORKER_API_KEY`: generate random string (replace the hardcoded one)

---

## Phase 3: Bug Fixes

### Task 3.1: Fix refresh token transaction failure handling (T-BUG-01)
**File:** `backend/src/controllers/authController.js:195-321`

1. Add a try/catch around the COMMIT call (line 291):
```js
try {
    await client.query('COMMIT');
    transactionComplete = true;
} catch (commitErr) {
    logger.error('Token refresh commit failed', { error: commitErr.message, userId });
    throw commitErr; // Will be caught by outer catch, which rolls back
}
```
2. Add structured error logging when token rotation fails at any point.
3. Ensure all `return next(...)` paths within the transaction set `transactionComplete = true` before returning if a COMMIT was already performed, or let the `finally` block handle rollback.

### Task 3.2: Add monitoring for audit log failures (T-BUG-03)
**File:** `backend/src/services/auditService.js:420-444`

1. After `runWithFallback` returns `null`, emit a structured warning:
```js
if (logId === null) {
    logger.warn('AuditService: audit entry could not be persisted', {
        action: entry.action,
        userId: entry.userId,
        resourceTable: entry.resourceTable,
        resourceId: entry.resourceId,
    });
}
```
2. Add `GET /api/health/audit` endpoint that writes and reads back a test audit entry.

### Task 3.3: Clean up duplicate database constraints (T-BUG-02)
**File:** `backend/constraints.json`

1. Remove duplicate constraints from `constraints.json`:
   - Remove entries at lines 99, 103, 107, 111 (the `chk_` prefixed duplicates)
   - Remove `examinations_exam_id_not_null` (line 39-41) — redundant with PK
2. Create migration `database/migrations/035_cleanup_duplicate_constraints.sql` that runs `ALTER TABLE examinations DROP CONSTRAINT IF EXISTS chk_examinations_pregnancy_safety_status ...` for each duplicate.
3. Add a CI check script `backend/scripts/checkDuplicateConstraints.js` that queries `pg_constraint` for duplicate definitions.

---

## Phase 4: Performance Optimizations

### Task 4.1: Parallelize DICOM image fetching (T-PERF-01)
**File:** `backend/src/services/cloudVisionService.js:1014-1058`

1. Add `p-limit` to `backend/package.json` dependencies and install.
2. Replace the sequential `for...of` loop with a concurrency-limited `Promise.allSettled`:
```js
const pLimit = require('p-limit');
const concurrencyLimit = pLimit(4);
const results = await Promise.allSettled(
    selectedInstances.map(instance => 
        concurrencyLimit(() => fetchDicomPreviewAsBase64(instance.orthancId, getOrthancAuth()))
    )
);
```
3. Process `results` array, building the `images` array from fulfilled promises while preserving the byte-budget logic.
4. Log skipped/failed instances (already logged in current code via catch block).

### Task 4.2: Move appointment availability filtering to SQL (T-PERF-02)
**File:** `backend/src/controllers/appointmentController.js:1092-1106`

1. Replace in-memory `appointments.filter()` with a SQL query that uses `CASE WHEN ... THEN 1 ELSE 0 END` to compute availability buckets directly in PostgreSQL.
2. Example query:
```sql
SELECT 
    modality_id, 
    EXTRACT(HOUR FROM start_time) as hour,
    COUNT(*) as booked_count,
    MAX(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as has_cancellation
FROM appointments 
WHERE start_time BETWEEN $1 AND $2
GROUP BY modality_id, hour
ORDER BY modality_id, hour;
```
3. Return pre-aggregated data instead of filtering a large array in JS.

### Task 4.4: Reduce audit savepoint overhead with batching (T-PERF-04)
**File:** `backend/src/services/auditService.js:390-418`

1. Add an in-memory audit buffer that accumulates entries (max 50 entries or 1000ms flush interval).
2. Flush via a batch `INSERT INTO ... VALUES (...), (...), (...)` query.
3. Keep the savepoint approach for the fallback path (schema mismatch recovery).
4. Make batch size configurable: `AUDIT_BATCH_SIZE` (default 50), `AUDIT_FLUSH_INTERVAL_MS` (default 1000).

---

## Phase 5: Concurrency & Logical Flaw Fixes

### Task 5.1: Fix appointment double-booking race condition (L-LOG-01)
**File:** `backend/src/controllers/appointmentController.js:177-193`

1. Add `FOR UPDATE` to the conflict check query:
```sql
SELECT appointment_id FROM appointments
WHERE modality_id = $1
AND status != 'Cancelled'
AND tstzrange(start_time, end_time) && tstzrange($2, $3)
FOR UPDATE
```
2. Create a migration `database/migrations/036_exclusion_constraint_appointments.sql` that adds a PostgreSQL exclusion constraint:
```sql
ALTER TABLE appointments ADD CONSTRAINT no_overlapping_appointments
EXCLUDE USING gist (modality_id WITH =, tstzrange(start_time, end_time) WITH &&)
WHERE (status != 'Cancelled');
```

### Task 5.2: Fix invoice payment status race condition (L-LOG-02)
**File:** `backend/src/controllers/invoiceController.js:306-348`

1. Add `FOR UPDATE` to the SELECT in the `totals` CTE:
```sql
WITH totals AS (
    SELECT ...
    FROM invoices i
    LEFT JOIN payments p ...
    WHERE i.invoice_id = $1
    FOR UPDATE
)
```

### Task 5.3: Fix RBAC permission cache staleness on login (L-LOG-03)
**File:** `backend/src/controllers/authController.js:17-36`

1. Add a `bypassCache` parameter to `getPermissionNamesForRole`:
```js
const getPermissionNamesForRole = async (db, role, bypassCache = false) => {
    if (role === 'Developer') { ... }
    if (!bypassCache) {
        const cached = permissionCache.get(role);
        if (cached && cached.size > 0) return Array.from(cached);
    }
    const result = await db.query(...);
    return result.rows.map(row => row.name);
};
```
2. In `login` (line 176) and `verify2FA` (line 429), call with `bypassCache = true`:
```js
const permissions = await getPermissionNamesForRole(db, user.role, true);
```

### Task 5.4: Fix duplicate migration version numbers (L-LOG-06)
**File:** `backend/database/migrate.js:21-121`

1. Renumber duplicate migrations:
   - `004_performance_indexes.sql` → `005_performance_indexes.sql`
   - `024_reporting_indices.sql` → `025_reporting_indices.sql`
   - `030_encrypt_pii_fields.sql` → `033_encrypt_pii_fields.sql`
   - `031_refresh_token_audit.sql` → `034_refresh_token_audit.sql`
   - `031_portal_schema_consistency.sql` → `036_portal_schema_consistency.sql`
   - `032_notification_preferences_consistency.sql` → `037_notification_preferences_consistency.sql`
   - `032_performance_indexes.sql` → `038_performance_indexes.sql`
2. Update the `MIGRATION_FILES` array in `migrate.js`.
3. Add a data migration to update the `schema_migrations` table: rename old filenames to new ones.
4. Add a CI check script `backend/scripts/checkMigrationNumbers.js` that verifies no duplicate numeric prefixes.

---

## Phase 6: Functional Gaps

### Task 6.1: Add retry/circuit-breaker for Orthanc/ClamAV calls (F-GAP-01)
**Files:** `backend/src/services/pacsDicomWebService.js`, `backend/src/server.js:463-486`

1. Add `opossum` to `backend/package.json` dependencies and install.
2. Create a circuit breaker wrapper in `backend/src/utils/circuitBreaker.js`:
```js
const CircuitBreaker = require('opossum');
const createCircuitBreaker = (asyncFunction, options = {}) => {
    return new CircuitBreaker(asyncFunction, {
        timeout: options.timeout || 30000,
        errorThresholdPercentage: 50,
        resetTimeout: options.resetTimeout || 30000,
        ...options,
    });
};
```
3. Wrap Orthanc REST calls in `pacsDicomWebService.js` with circuit breakers.
4. For `checkClamAv`, add retry with exponential backoff (2 retries, 1s and 2s delays).
5. On circuit breaker open, return cached/fallback data where appropriate (e.g., cached Orthanc system status).

### Task 6.2: Async PACS webhook processing via job queue (F-GAP-02)
**Files:** `backend/src/controllers/pacsController.js:565-574`, `backend/src/services/pacsReconcileService.js`

**Action Plan A (Simple — PostgreSQL-based queue):**
1. Create `backend/src/services/pacsReconciliationQueue.js` with:
   - `enqueueJob(pool, payload)` — INSERT into `pacs_reconciliation_queue` table
   - `processQueue(pool)` — poll for pending jobs, process with `reconcileInstance`, mark complete
   - `startWorker(pool, intervalMs)` — `setInterval` calling `processQueue`
2. Modify `handleWebhook` in `pacsController.js` to call `enqueueJob` instead of `reconcileInstance` directly, then return 200 immediately.
3. Create DB migration `039_pacs_reconciliation_queue.sql` to add the queue table.
4. Start the worker in `server.js` on startup.

**Action Plan B (Robust — BullMQ/Redis):** Requires adding Redis as a dependency. Use Plan A initially.

### Task 6.3: Enforce pagination limits on list endpoints (F-GAP-06)
**Files:** Various controllers using `LIMIT/OFFSET`

1. Create `backend/src/utils/pagination.js` with a `getPagination(query, maxLimit = 500)` function:
```js
function getPagination(query, maxLimit = 500) {
    let limit = parseInt(query.limit, 10) || 50;
    const offset = parseInt(query.offset, 10) || 0;
    if (limit > maxLimit) limit = maxLimit;
    return { limit, offset };
}
```
2. Apply to `/api/patients`, `/api/appointments`, `/api/reports/*`, and any other list endpoints.
3. Add Zod schema refinements to enforce `limit` max in query schemas.

### Task 6.4: Add audit trail for RBAC permission changes (F-GAP-07)
**Files:** `backend/src/controllers/rbacController.js`, `backend/src/services/auditService.js`

1. In RBAC controller mutation handlers, add explicit `logAction` calls:
```js
await logAction(db, {
    userId: req.user.user_id,
    action: 'RBAC_PERMISSION_CHANGED',
    resourceId: permissionId,
    resourceTable: 'role_permissions',
    ipAddress: req.ip,
    details: { before: oldPermissions, after: newPermissions }
});
```

### Task 6.5: Standardize error response shapes (F-GAP-08)
**File:** `backend/src/middleware/authMiddleware.js:101, 107, 250, 290`

1. Replace direct `res.status(401).json(...)` and `res.status(403).json(...)` calls with `return next(new AppError(...))`:
   - Line 101: `res.status(401).json({ error: 'Access Denied: No Token Provided' })` → `return next(new AppError('Access Denied: No Token Provided', 401))`
   - Line 107: `res.status(403).json({ error: 'Access Denied: Insufficient Permissions' })` → `return next(new AppError('Access Denied: Insufficient Permissions', 403))`
   - Line 162: `res.status(403).json({ error: 'Invalid Token', code: 'INVALID_ACCESS_TOKEN' })` → `return next(new AppError('Invalid Token', 401, { code: 'INVALID_ACCESS_TOKEN' }))`
   - Line 178: `res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' })` → `return next(new AppError('Access token expired', 401, { code: 'TOKEN_EXPIRED' }))`
   - Line 158: `res.status(401).json({ error: 'Invalid Token', code: 'INVALID_ACCESS_TOKEN' })` → `return next(new AppError('Invalid Token', 401, { code: 'INVALID_ACCESS_TOKEN' }))`
2. Update `AppError` in `backend/src/middleware/errorHandler.js` to accept a `code` option in the constructor.

---

## Phase 7: Infrastructure & CI/CD

### Task 7.1: Update CI action versions (T-SEC-15)
**File:** `.github/workflows/quality-gates.yml:55,58,90,98,106`

1. Update `actions/checkout@v4` → `actions/checkout@v5`
2. Update `actions/setup-node@v4` → `actions/setup-node@v5`
3. Update `aquasecurity/trivy-action@v0.31.0` → `aquasecurity/trivy-action@v0.32.0`

### Task 7.2: Add portal cache-dependency-path for CI
**File:** `.github/workflows/quality-gates.yml:62-65`

1. Add `./portal/package-lock.json` to the `cache-dependency-path` list.

### Task 7.3: Add frontend test:ci to CI (verify it's there)
**File:** `.github/workflows/quality-gates.yml`

1. The CI already runs `npm run lint` for frontend (line 136) and `npm run test:ci` for frontend (line 140). **No change needed** — frontend type-checking is NOT applicable since it's plain JS, not TypeScript.

### Task 7.4: Remove sudo from start-services.js (T-SEC-16)
**File:** `D:\RCMS\start-services.js:178` (root level, not backend/)

1. Remove the `execSync('sudo systemctl start docker', ...)` call.
2. Replace with a check that detects Docker availability and shows a clear error message:
```js
try {
    execSync('docker info', { stdio: 'ignore' });
} catch {
    console.error('Docker is not running. Please start Docker and try again.');
    process.exit(1);
}
```

### Task 7.5: Fix backend/.env comment (F-GAP-04)
**File:** `backend/.env:1`

1. Change line 1 to: `## This file is gitignored (see .gitignore). Copy from .env.example and do NOT commit secrets.`

### Task 7.6: Update .env.example with required variables
**File:** `.env.example`

1. All required variables should already be documented, but verify `ORTHANC_PASSWORD`, `PACS_WEBHOOK_SECRET`, and `BLIND_INDEX_KEY` are present with clear instructions. (They are — lines 12, 85, 93).

---

## Phase 8: Testing & Validation

### Task 8.1: Install new dependencies
```bash
cd backend && npm install --save stripe opossum p-limit
```

### Task 8.2: Run full test suite
1. `cd backend && npm run test:ci`
2. `cd frontend && npm run lint && npm run test:ci`
3. `cd portal && npm run typecheck && npm run build`
4. `npm run validate-deployment` (from backend)
5. `npm audit --omit=dev --audit-level=high --prefix backend`
6. `npm audit --omit=dev --audit-level=high --prefix frontend`
7. `npm audit --omit=dev --audit-level=high --prefix portal`

### Task 8.3: Verify migrations
1. `node database/migrate.js --fresh --seed`
2. Verify no duplicate migration numbers.

### Task 8.4: Verify CI workflow
1. `docker compose config --quiet` (validate compose config)
2. `docker compose build --pull backend frontend portal ohif`

---

## Implementation Order (Dependencies)

```
Phase 1 — Critical (blocks everything)
  1.1 → 1.2 → 1.3 → 1.4/1.5 → 1.6

Phase 2 — High (parallel with each other, requires Phase 1.1 for env validation)
  2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11

Phase 3 — Bugs (parallel, independent)
  3.1, 3.2, 3.3

Phase 4 — Performance (parallel, independent)
  4.1, 4.2, 4.4

Phase 5 — Concurrency (5.1/5.2 need DB migrations)
  5.1, 5.2, 5.3, 5.4

Phase 6 — Functional Gaps (parallel, 6.2 needs migration)
  6.1, 6.2, 6.3, 6.4, 6.5

Phase 7 — Infrastructure/CI (parallel, independent)
  7.1, 7.2, 7.3, 7.4, 7.5, 7.6

Phase 8 — Testing & Validation (runs after all code changes)
  8.1 → 8.2 → 8.3 → 8.4
```

## Key Files Reference Table

| File | Line(s) | Issue |
|------|---------|-------|
| `backend/src/config/validateEnv.js` | 8-13, 30-40, 49-53 | Missing required env vars in dev |
| `backend/src/utils/crypto.js` | 49-56, 69 | CBC fallback, blind index key fallback |
| `backend/src/services/pacsDicomWebService.js` | 12-28 | Orthanc password fallback |
| `backend/src/services/cloudVisionService.js` | 955 | Orthanc password fallback |
| `backend/src/services/pacsModalityRegistryService.js` | 19 | Orthanc password fallback |
| `backend/src/controllers/pacsController.js` | 547-584 | Webhook, password fallback |
| `backend/src/middleware/webhookAuth.js` | 33, 38-64 | Mock Stripe/Twilio validation |
| `backend/src/middleware/authMiddleware.js` | 15, 67, 101, 107, 143, 158, 178, 250 | Whitelist, direct res.json |
| `backend/src/middleware/rbacMiddleware.js` | 3-8, 23-26 | Cache TTL, login bypass |
| `backend/src/controllers/authController.js` | 17-36, 195-321 | Cache bypass, transaction handling |
| `backend/src/services/realtimeService.js` | 38-50 | Token from query param |
| `backend/src/services/aiReportService.js` | 353 | SSRF bypass for non-custom providers |
| `backend/src/controllers/appointmentController.js` | 177-193 | No FOR UPDATE on conflict check |
| `backend/src/controllers/invoiceController.js` | 306-348 | No FOR UPDATE on invoice row |
| `backend/src/controllers/patientController.js` | 286-297 | Exact-match search on hashed fields |
| `backend/src/services/auditService.js` | 390-418, 420-444 | Savepoint per request, silent failures |
| `backend/src/services/cloudVisionService.js` | 1014-1058 | Sequential image fetching |
| `backend/src/middleware/rateLimiter.js` | — | Base rate limiters |
| `backend/src/middleware/rateLimiters.js` | — | Endpoint-specific rate limiters |
| `backend/src/routes/pacsRoutes.js` | 114 | PACS webhook route |
| `backend/src/server.js` | 442, 530, 1724 | DB fallback, helmet defaults, SSE route |
| `backend/src/utils/customAiEndpointUrl.js` | 60-85 | SSRF validation (needs DNS resolution) |
| `frontend/src/App.jsx` | 39, 125-147, 296-318, 341 | localStorage, client-side auth, SSE token |
| `frontend/src/store/authSlice.js` | 39, 47 | localStorage user object |
| `portal/src/lib/api.ts` | 20, 45-58, 81 | localStorage fallback, JWT decode, missing credentials |
| `portal/src/store/authSlice.ts` | 27, 56, 64, 83 | localStorage user object |
| `portal/src/App.tsx` | 25-32 | Missing mustChangePassword check |
| `portal/src/pages/DoctorPortal.tsx` | 95 | SSE token in URL |
| `.github/workflows/quality-gates.yml` | 55, 58, 62-65, 90, 98, 106 | Outdated actions, missing portal cache |
| `start-services.js` | 178 | sudo systemctl start docker |
| `.env` | 3, 8, 9, 10, 12, 21, 40 | Weak secrets |
| `backend/.env` | 1, 4 | Misleading comment, admin password |
| `backend/.env.test` | 3-4 | Weak test secrets |
| `backend/constraints.json` | 19 & 99, 22 & 103, etc. | Duplicate constraint definitions |
| `backend/database/migrate.js` | 21-121, 255 | Duplicate migration numbers, DB URL fallback |
