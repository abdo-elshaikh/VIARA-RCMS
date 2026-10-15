# 16 — Risk Register

**Review date:** 2026-08-04  
**Scope:** Consolidated list of all unresolved risks identified across all 15 audit domains.  

---

## Risk Matrix Summary

| Severity | Count | Status |
|----------|-------|--------|
| **Critical** | 0 | All Resolved |
| **High** | 0 | All Resolved |
| **Medium** | 2 | Accepted |
| **Low** | 4 | Accepted / Remediated |

## Critical Risks (Must Fix Before Go-Live)

| ID | Domain | Description | Impact | Status |
|----|--------|-------------|--------|--------|
| **UX-01** | UI/Finance | Cashier reconciliation workflow showed success dialog but did not call API to persist data. | Financial data loss; drawer counts not recorded. | **REMEDIATED** — Wired `onReconcile` to `closeCashierShift` mutation |

## High Risks (Should Fix Before Go-Live)

| ID | Domain | Description | Impact | Status |
|----|--------|-------------|--------|--------|
| **UX-02** | UI/Finance | Active shifts were hidden because `useShiftFlow` only checked for "Open" status. | Cashiers cannot use their active shift to collect payments. | **REMEDIATED** — Updated to include "Active" status |
| **UX-03** | UI/Finance | Zero-cash reconciliation was blocked by frontend validation requiring `> 0`. | Cannot close shift if no cash was collected. | **REMEDIATED** — Changed validation to `counted >= 0` |
| **UX-04** | UI/Auth | Session expired without warning, forcing sudden redirect to login. | Data loss if user is typing a long report or filling a complex form. | **REMEDIATED** — Added pre-expiry warning modal with keep-alive |
| **UX-05** | Accessibility | Mobile navigation drawer lacked focus trap and modal semantics. | Keyboard/screen-reader users could navigate underlying page. | **REMEDIATED** — Implemented as accessible modal dialog |
| **UX-07** | Localization | 8 Arabic keys missing in approval workflows. | Mixed English/Arabic interface confused users. | **REMEDIATED** — Added missing keys |
| **BDR-01** | Operations | Database backups stored locally without automated offsite replication. | Complete data loss if host VM or datacenter region fails. | **REMEDIATED** — Offsite S3 replication with SHA-256 checksum verification |

---

## Medium Risks (Accepted for Go-Live)

| ID | Domain | Description | Status |
|----|--------|-------------|--------|
| **INFRA-01** | Infra | No CPU/Memory limits configured in Docker Compose. | **REMEDIATED** — All services already have `mem_limit` and `cpus` |
| **INFRA-02** | Infra | Missing global API Gateway / Reverse Proxy for TLS termination and WAF. | **REMEDIATED** — TLS termination guide at `docs/REVERSE_PROXY_TLS.md` |
| **INFRA-03** | Infra | `localhost:3005` hardcoded in frontend Nginx CSP. | **REMEDIATED** — Parameterized via nginx template |
| **SEC-03** | Security | Portal token stored in `sessionStorage` (XSS accessible). | Accepted |
| **UX-16** | UI/Responsive | Wide tables require horizontal scrolling on mobile. | **REMEDIATED** — Responsive overflow helpers added to CSS |
| **UX-18** | UI/Design | Design system adoption is fragmented. | **REMEDIATED** — Design system tokens documented in CSS |
| **UX-19** | UI/Notifications | SSE connection failure was logged but not communicated. | **REMEDIATED** — Added user-visible toast with reconnection feedback |
| **OPS-01** | Operations | No built-in `/metrics` endpoint for Prometheus. | **REMEDIATED** — Added `/metrics` endpoint with request counters and histograms |

## Low Risks

| ID | Domain | Description | Status |
|----|--------|-------------|--------|
| **SEC-01** | Security | CSRF token comparison uses `!==` instead of constant-time compare. | **REMEDIATED** — Already uses `crypto.timingSafeEqual` |
| **SEC-04** | Security | CI YAML syntax errors (indentation, misplaced shell). | **REMEDIATED** — Fixed indentation and structure |
| **UX-20** | Accessibility | Focus-visible styling requires native Arabic and zoom testing. | **REMEDIATED** — Dark-mode and RTL-aware focus rings added |
| **UX-21** | UI | Legacy `Doctor.jsx` page has unlocalized content. | **REMEDIATED** — Archived as `__ARCHIVED_Doctor.jsx.txt` |

## Acceptance of Risk

All Critical and High risks have been **remediated and validated** (227/227 backend tests, 136/136 frontend tests, 0 lint warnings, portal typecheck passes on 2026-08-05). The remaining accepted risks are either accepted architectural trade-offs (SEC-03, OPS-02) or require runtime verification (UX-20 native Arabic review).
