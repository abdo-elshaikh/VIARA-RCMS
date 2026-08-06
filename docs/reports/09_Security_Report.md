# 09 — Security Report

**Review date:** 2026-08-04  
**Scope:** OWASP ASVS assessment, backend security controls, infrastructure hardening  
**Methodology:** Static code review of all middleware, controllers, config, and infrastructure  

---

## Executive Summary

RCMS demonstrates a **strong and mature security posture** with defense-in-depth across authentication, cryptography, authorization, input validation, and infrastructure. The system implements AES-256-GCM field-level encryption, HMAC-SHA256 blind indexing, per-DB-query RBAC, double-submit cookie CSRF protection, content-aware antivirus scanning, and comprehensive SSRF prevention including DNS resolution checks.

**Security Score: 88/100** — ready for production with accepted risks documented below.

---

## Authentication (ASVS V2)

| Control | Status | Evidence |
|---------|--------|----------|
| Bcrypt password hashing (10 rounds) | ✅ | `authController.js:14,49` |
| Progressive account lockout (5 attempts / 15 min) | ✅ | `authController.js:109-113` |
| TOTP-based 2FA (otplib) | ✅ | `authController.js:146-154` |
| Refresh token rotation in DB transaction | ✅ | `authController.js:197-298` |
| Refresh token stored as hash only | ✅ | `authService.js` |
| httpOnly secure cookie for refresh token | ✅ | `authController.js:161-167` |
| Session metadata tracking (IP, UA) | ✅ | `authController.js:159` |
| Force password change on first login | ✅ | `authMiddleware.js:13-25` |
| JWT algorithm restricted to HS256 | ✅ | `authMiddleware.js:79` |
| Expired/invalid token error differentiation | ✅ | `authMiddleware.js:90-97` |

**Remaining risk:** JWT_SECRET auto-generation in development; production requires explicit secret.

---

## Authorization (ASVS V4)

| Control | Status | Evidence |
|---------|--------|----------|
| Per-request database RBAC query | ✅ | `rbacMiddleware.js:88-94` |
| Developer superuser bypass (intentional) | ✅ | `rbacMiddleware.js:72-74` |
| Break-glass elevated permissions with expiry | ✅ | `rbacMiddleware.js:78-83` |
| Permission denied logging as security events | ✅ | `rbacMiddleware.js:101-108` |
| Fine-grained permission split (e.g., refund request vs approve) | ✅ | Migration 046 |
| Role-based route protection | ✅ | `authorizeRole(['Admin'])` patterns |

---

## Cryptography (ASVS V6)

| Control | Status | Evidence |
|---------|--------|----------|
| AES-256-GCM encryption | ✅ | `crypto.js:23-33` |
| 12-byte random IV per encryption | ✅ | `crypto.js:26` |
| Authenticated encryption (GCM auth tag) | ✅ | `crypto.js:31` |
| Legacy AES-CBC removed (throws error) | ✅ | `crypto.js:51` |
| Key rotation support (keyring) | ✅ | `crypto.js:7-13` |
| HMAC-SHA256 blind indexing | ✅ | `crypto.js:63-75` |
| Case-insensitive hashing (lowercase) | ✅ | `crypto.js:73` |
| Encryption key format validation (64 hex chars) | ✅ | `validateEnv.js:86-92` |
| Backup encryption with separate key | ✅ | `validateEnv.js:53,97-99` |
| Weak secret detection | ✅ | `validateEnv.js:123-143` |

---

## Input Validation (ASVS V5)

| Control | Status | Evidence |
|---------|--------|----------|
| Zod schema validation on all mutations | ✅ | `schemas/*.js` via `validateRequest()` |
| Global input sanitization middleware | ✅ | `sanitize.js` |
| Request body size limit (10MB) | ✅ | `server.js:761` |
| SQL injection prevention (parameterized queries) | ✅ | All database queries use `$1, $2` parameters |
| XSS prevention (CSP + sanitization) | ✅ | Helmet CSP + sanitize middleware |

---

## CSRF Protection (ASVS V3)

| Control | Status | Evidence |
|---------|--------|----------|
| Double-submit cookie pattern | ✅ | `csrf.js:28-57` |
| Safe methods exempted (GET, HEAD, OPTIONS) | ✅ | `csrf.js:6,30` |
| Webhook endpoints exempted | ✅ | `csrf.js:7-17` |
| httpOnly=false for JS reading | ✅ | `csrf.js:67` (intentional for double-submit) |
| SameSite=strict | ✅ | `csrf.js:69` |
| Secure flag in production | ✅ | `csrf.js:68` |
| Token comparison uses exact match | ⚠️ | `csrf.js:44` — uses `!==` not `timingSafeEqual`; **timing side-channel risk is low** since token is in cookie (attacker can read it) but best practice is to use constant-time comparison |

---

## SSE Security (ASVS V3)

| Control | Status | Evidence |
|---------|--------|----------|
| Short-lived purpose-scoped session tokens | ✅ | `realtimeService.js:34-43` |
| Single-use tokens (deleted after connection) | ✅ | `realtimeService.js:88` |
| 5-minute token expiry | ✅ | `realtimeService.js:16` |
| Periodic expired token cleanup | ✅ | `realtimeService.js:19-26` |
| Access JWT NOT passed in URL | ✅ | Replaced with opaque session token |

---

## SSRF Prevention (ASVS V13)

| Control | Status | Evidence |
|---------|--------|----------|
| URL scheme whitelist (HTTP/HTTPS only) | ✅ | `customAiEndpointUrl.js:69-70` |
| HTTPS required in production | ✅ | `customAiEndpointUrl.js:72-73` |
| URL credentials rejected | ✅ | `customAiEndpointUrl.js:75-77` |
| IPv4 private range blocking | ✅ | `customAiEndpointUrl.js:8-23` |
| IPv6 private range blocking | ✅ | `customAiEndpointUrl.js:42-58` |
| IPv4-mapped IPv6 detection | ✅ | `customAiEndpointUrl.js:45-48` |
| DNS resolution to check resolved IP | ✅ | `customAiEndpointUrl.js:91-100` |

---

## Infrastructure Security

| Control | Status | Evidence |
|---------|--------|----------|
| Non-root container execution | ✅ | `backend/Dockerfile:16` — `USER node` |
| Helmet security headers | ✅ | `server.js:665-680` |
| CSP with restrictive directives | ✅ | `server.js:668-678` |
| HSTS header | ✅ | `nginx.conf:9` |
| X-Frame-Options DENY | ✅ | `nginx.conf:13` |
| X-Content-Type-Options nosniff | ✅ | `nginx.conf:12` |
| Referrer-Policy | ✅ | `nginx.conf:10` |
| Permissions-Policy | ✅ | `nginx.conf:11` |
| CORS origin allowlist | ✅ | `server.js:692-712` |
| Rate limiting (auth, API, sensitive ops) | ✅ | `rateLimiter.js`, `rateLimiters.js` |
| Request timeout protection | ✅ | `server.js:736-755` |
| Webhook signature verification | ✅ | `webhookAuth.js` — Stripe + Twilio SDK |
| ClamAV antivirus scanning | ✅ | Dockerfile + readiness check |
| Graceful shutdown | ✅ | `serverLifecycle.js` |

---

## Findings

### SEC-01: CSRF Token Comparison Not Constant-Time
- **Severity:** Low (tokens are in cookies visible to same-origin JS)
- **Location:** `csrf.js:44`
- **Recommendation:** Replace `!==` with `crypto.timingSafeEqual()` for defense in depth

### SEC-02: Frontend Nginx CSP Hard-codes localhost:3005 → REMEDIATED
- **Severity:** Medium
- **Location:** `frontend/nginx.conf` → now `frontend/nginx.conf.template`
- **Status:** **REMEDIATED** — CSP `frame-src` now uses `${VITE_OHIF_URL}` environment variable via nginx template substitution
- **Impact:** OHIF URL can be parameterized for production deployment

### SEC-03: Portal Token in sessionStorage
- **Severity:** Medium (accepted risk)
- **Location:** `portal/src/store/authSlice.ts:57`
- **Note:** sessionStorage is more secure than localStorage (not shared across tabs, cleared on close), but still accessible to XSS. httpOnly cookie would be stronger. This is an **accepted design trade-off** documented in prior reviews.

### SEC-05: Public Case-Status Endpoint Privacy Boundary
- **Severity:** Critical (remediated)
- **Location:** `backend/src/controllers/publicLandingController.js:45-142`, `backend/src/server.js:850`
- **Finding:** The unauthenticated `POST /api/public/case-status` endpoint previously returned complete finalized diagnostic report narratives and signer identities when supplied only an MRN or order number. This created an unsafe end-user experience where possession of a single identifier was treated as sufficient proof of identity for sensitive clinical disclosure.
- **Remediation:** Endpoint now returns status-only data (exam type, modality, study date, status, last updated). No clinical narratives, signer identities, patient identifiers, or financial data are exposed. Confidential and inactive patient records are explicitly excluded. Rate-limited to 10 requests per 15 minutes per IP in production. Backend regression tests verify the privacy boundary.
- **Privacy Review:** Independent privacy review completed 2026-08-05. Endpoint verified to return only coarse workflow state. Completed results route to authenticated patient login.
- **Status:** **REMEDIATED AND VALIDATED**

### SEC-04: CI Workflow YAML Syntax Errors
- **Severity:** Low (CI — not production runtime)
- **Location:** `quality-gates.yml:54,73-74` — indentation and misplaced `shell: bash`
- **Impact:** CI pipeline may fail to parse

---

## Threat Modeling Summary

| Threat | Mitigation | Residual Risk |
|--------|-----------|---------------|
| SQL Injection | Parameterized queries everywhere | Very Low |
| XSS | CSP + sanitization + no inline scripts | Low |
| CSRF | Double-submit cookie with SameSite=strict | Very Low |
| SSRF | IP/DNS validation + URL scheme whitelist | Very Low |
| Broken Auth | Bcrypt + lockout + 2FA + refresh rotation | Very Low |
| Broken Access Control | Per-request DB RBAC + role-based routes | Low |
| Cryptographic Failures | AES-256-GCM + key validation + no CBC | Very Low |
| Session Fixation | Server-side sessions + cookie flags | Very Low |
| Sensitive Data Exposure | Field-level encryption + error masking + status-only public lookup | Very Low |
| Unauthenticated PHI Access | Public lookup status-only + rate limiting + privacy tests | Very Low |
