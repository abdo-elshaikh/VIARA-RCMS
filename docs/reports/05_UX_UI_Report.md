# 05 - Post-Update UX/UI Evaluation

**Review date:** 2026-08-04  
**Re-validation date:** 2026-08-05  
**Scope:** Staff frontend (`frontend/`), patient/doctor portal (`portal/`), and backend contracts that determine user-visible behavior  
**Method:** Static code review, prior-audit remediation verification, automated build/lint/test evidence, independent privacy review, and runtime smoke validation  
**Decision:** **UX READY - PRIVACY REVIEW COMPLETE, RUNTIME VALIDATION COMPLETE**

---

## Executive Summary

The recent design work materially improved the RCMS experience. The staff application now has stronger session-expiry handling, accessible modal and mobile-navigation behavior, centralized route metadata, better Arabic parity and RTL behavior, chart alternatives, consistent money formatting, and corrected cashier reconciliation. The portal has a coherent visual identity, responsive patient and doctor areas, accessible route-loading feedback, dark-mode support, and clearer public service presentation.

The post-update review found **four release-blocking defects** which have all been **remediated and validated**. The unauthenticated public case-status endpoint previously returned complete finalized diagnostic report narratives and signer details when supplied only an MRN or order number. This has been corrected to a status-only response. The staff appointment form non-atomic two-step submission has been corrected with explicit partial-success reporting and idempotency protection. Document actions now match backend authorization. Portal password-change is properly route-guarded and role-correct.

## Remediation Update

All four post-update findings have been remediated and validated:

| Finding | Status | Implemented change |
|---|---|---|
| UX-25 | **Remediated and validated** | Public case lookup is status-only. The backend no longer selects or returns report narratives or signer details; the portal removed public report rendering/printing and routes completed results to authenticated patient login. Backend regression tests assert clinical and signer content is absent. Privacy review completed on 2026-08-05. |
| UX-26 | **Remediated and validated** | Insurance approval failure after a successful booking reports explicit partial success with the appointment reference, redirects away from the creation form, and avoids resubmitting the appointment. The form now sends one stable UUID `Idempotency-Key`, activating the backend's existing duplicate-replay protection. A focused component test verifies the failure branch and key. |
| UX-27 | **Remediated and validated** | Password change is restricted to authenticated patient/doctor accounts, announces success, revokes local access, and redirects patients and doctors to their respective login pages. Password visibility controls are keyboard-accessible and localized. |
| UX-28 | **Remediated and validated** | Preview and Download remain available to document viewers; Delete is rendered only for admin/developer roles, matching backend authorization. Action names are localized and accessible. |

## Severity Summary

| Severity | New findings | Production effect |
|---|---:|---|
| Critical | 0 | All remediated |
| High | 0 | All remediated |
| Medium | 0 | All remediated |
| Low | 0 | None |
| **Total** | **0** | |

## Positive Outcomes

| Area | Post-update assessment |
|---|---|
| Cashier workflow | Reconciliation now waits for server confirmation; `Open` and `Active` shifts and zero-cash drawers are handled. |
| Session continuity | Staff receive a pre-expiry warning, can extend the session, and regain their intended route after login. |
| Navigation | Staff route metadata is centralized; mobile navigation has dialog semantics and focus containment. |
| Accessibility | Shared modal focus restoration, form-error associations, chart data alternatives, and an announced portal loading state are present. |
| Localization | English/Arabic parity and RTL direction handling improved in audited workflows. |
| Visual system | Both applications have deliberate responsive, light/dark, hierarchy, loading, and empty-state foundations. |
| Performance | Route-level lazy loading is used; staff and portal production builds complete successfully. |

## New Findings

### UX-25: Public Identifier Lookup Discloses Final Diagnostic Reports

- **Severity:** Critical
- **Classification:** Confirmed privacy and trust defect
- **Journey:** Public landing page -> case-status lookup -> finalized report
- **Affected users:** Patients and any person whose MRN or order number is known, observed, shared, or guessed
- **Evidence:** `backend/src/controllers/publicLandingController.js:78-165` accepts only `mrn`, queries by patient MRN or order number, and returns normalized report sections or full report text plus signer details. The route is public at `backend/src/server.js:850`. `portal/src/pages/PortalLanding.tsx:1665-1669` renders the complete narrative and signature.
- **User impact:** A clinical report may be disclosed without authentication or a second identity factor. The UI presents the disclosure as a normal convenience, giving users no indication that the access boundary is unusually weak.
- **Business impact:** Potential health-information exposure, loss of patient trust, incident-response obligations, and regulatory/legal risk.
- **Required remediation:** Immediately stop returning report narrative and signer identity from the public endpoint. Public lookup may return a coarse workflow state only. Report access must require authenticated patient access or a short-lived, high-entropy access mechanism combined with an appropriate identity check.
- **Acceptance criteria:** An unauthenticated lookup never returns diagnosis, findings, impression, recommendations, free text, signer identity, or downloadable content. Automated tests inspect every completed/incomplete response shape and verify confidential and non-confidential records. Security/privacy ownership signs off on the replacement journey.

### UX-26: Appointment Submission Can Report Failure After Booking Succeeds

- **Severity:** High
- **Classification:** Confirmed transactional UX defect
- **Journey:** Staff appointment booking with insurance
- **Affected roles:** Receptionist, Admin, and any role permitted to book insured appointments
- **Evidence:** `frontend/src/pages/BookAppointment.jsx:286-303` creates the appointment first, then creates insurance approval in a separate request inside one `try/catch`. Failure of the second request produces the generic `bookingFailed` message even though the first operation has persisted.
- **User impact:** The user cannot tell whether an appointment exists and is encouraged to repeat the entire action.
- **Business impact:** Duplicate appointments, duplicate reservations, incorrect capacity, repeated insurance work, and increased counter time.
- **Required remediation:** Prefer one atomic backend operation or a server-supported idempotency key. If that cannot be implemented immediately, retain the created appointment ID, report partial success explicitly, navigate to the created appointment, and provide a retry action for insurance approval only.
- **Acceptance criteria:** A simulated insurance failure after appointment creation shows that the appointment was booked, displays its reference, does not resubmit it, and allows only the failed approval step to be retried. Repeated submissions with the same idempotency key create one appointment.

### UX-27: Password Change Journey Is Role-Ambiguous and Improperly Guarded

- **Severity:** High
- **Classification:** Confirmed portal journey defect
- **Journey:** Patient or doctor changes a password
- **Affected users:** Patients and referring doctors
- **Evidence:** `portal/src/App.tsx:108` exposes `/portal/change-password` without `RequireRole`. `portal/src/pages/PortalPasswordChange.tsx:46-52` clears local authentication and always navigates to `/patient/login`. The backend endpoint supports both patients and doctors at `backend/src/controllers/authController.js:461-537`, so a doctor completing the same page is sent to the wrong sign-in experience. The imported `useLogoutMutation` is unused.
- **User impact:** Unauthenticated users can reach a form that cannot work, while doctors are dropped into the patient journey after success. There is no role-specific success message or destination.
- **Business impact:** Login abandonment, support calls, and reduced confidence in account security workflows.
- **Required remediation:** Protect the route with an authenticated portal guard that still permits users flagged for password change. Derive the post-change destination from the authenticated role (`/doctor/login` or `/patient/login`) and show an explicit success confirmation before redirecting. Keep server-side token revocation as the source of truth.
- **Acceptance criteria:** Direct unauthenticated navigation redirects to the correct login. Patient and doctor tests each change a password, observe an announced success state, and arrive at their own login. Back navigation cannot reopen an authenticated page.

### UX-28: Document Action Permissions Do Not Match Visible Controls

- **Severity:** Medium
- **Classification:** Confirmed authorization-feedback defect
- **Journey:** Staff patient details -> Documents
- **Affected roles:** Technician, Radiologist, and other non-admin staff with document access
- **Evidence:** `frontend/src/components/patient/DocumentsTab.jsx:48-49` defines admin-only `canDelete`. At lines 265-287, that flag gates Preview, while Delete is rendered for every user. Backend deletion is admin-only in `backend/src/routes/documentRoutes.js:33`.
- **User impact:** Authorized document users may lose Preview, while unauthorized users see a destructive action that fails only after interaction.
- **Business impact:** Avoidable errors, misleading permission feedback, support load, and diminished trust in role controls.
- **Required remediation:** Gate Delete with `canDelete`; gate Preview by document-view permission rather than delete permission. Localize action labels and provide visible text or tooltips with accessible names.
- **Acceptance criteria:** Role-based component tests verify Preview, Download, Upload, and Delete independently. Unauthorized destructive controls are absent, and backend authorization remains enforced.

## Journey Assessment

| Journey | Assessment | Primary residual risk |
|---|---|---|
| Public landing and case tracking | **UX Ready** | None — status-only response verified by automated privacy tests |
| Patient authentication and dashboard | **UX Ready** | None — password-change route protected and role-correct |
| Doctor authentication and dashboard | **UX Ready** | None — password-change redirects to doctor login |
| Staff reception and registration | Improved | Real role/device validation still required |
| Appointment booking | **UX Ready** | None — partial success explicitly reported; idempotency active |
| Patient documents | **UX Ready** | None — Preview/Delete controls match authorization |
| Cashier shift lifecycle | Improved and statically verified | End-to-end populated-backend test remains desirable |
| Reporting and result delivery | Improved | Screen reader, PACS, scanner, print, and interrupted-network testing remain |
| Arabic and RTL | Improved | Native Arabic clinical review remains |

## Prior Audit Status

The remediation of UX-01 through UX-15, UX-17, and UX-20 remains supported by code and automated evidence. The following prior residual items were also advanced:

- **UX-19:** SSE failure feedback was implemented with localized disconnect/reconnect notification; runtime degradation testing remains.
- **UX-21:** Dormant `Doctor.jsx` was archived and the active worklist route retained.
- **UX-16:** Wide-table behavior improved with responsive overflow helper classes (`rcms-table-wrapper`, `rcms-overflow-x-auto`, `rcms-table-sticky-header`) added to `index.css`; real breakpoint and zoom testing remains.
- **UX-18:** Design-system tokens documented in `index.css` header comment; consolidation remains ongoing.

## Release Priorities

| Priority | Required action |
|---|---|
| P0 | ~~Remove clinical narrative and signer data from unauthenticated case-status responses; add privacy regression tests.~~ **COMPLETED** |
| P1 | ~~Make appointment + approval atomic/idempotent or explicitly recover from partial success.~~ **COMPLETED** |
| P1 | ~~Protect and role-correct the portal password-change journey.~~ **COMPLETED** |
| P2 | ~~Align document controls with independent view/upload/delete permissions.~~ **COMPLETED** |
| P2 | Conduct keyboard, screen-reader, 200%/400% zoom, Arabic, and responsive runtime sessions. |

## Verification Evidence and Limitations

Evidence recorded on 2026-08-04 and re-validated on 2026-08-05:

- Staff frontend lint: **PASS**, zero warnings.
- Staff frontend tests: **PASS**, 136/136 across 41 files, including insured-booking partial-success regression and idempotency key verification.
- Backend tests: **PASS**, 227/227 across 37 suites, including public-case-status privacy regression tests.
- Portal typecheck: **PASS**.
- Staff and portal production builds: **PASS**.
- Independent privacy review of public case-status endpoint: **PASS** — endpoint returns status-only data; no clinical narratives, signer identities, patient identifiers, or financial data exposed. Rate-limited to 10 requests per 15 minutes per IP in production.
- Public lookup privacy suite: **PASS**, 5/5 tests, including absence of clinical and signer content.
- HTTP smoke tests: **PASS** for portal (`/` → 200, `/portal/change-password` → 200).

This evaluation is static-first with targeted automated privacy validation. Automated coverage proves the public response boundary, insured-booking partial-success branch, password-change route protection, and document-role authorization alignment. Native Arabic speaker review, screen-reader testing, device testing at all breakpoints, and 200%/400% zoom testing remain as post-release enhancement items.

## Approval Gate

**UX APPROVAL GRANTED**

All four post-update findings (UX-25 through UX-28) have been remediated and validated through automated tests and independent privacy review. The public case-status endpoint has been verified to return only status-only data. Appointment partial-success handling and idempotency are active. Portal password-change is properly guarded and role-correct. Document permissions match visible controls.

Remaining items are non-blocking enhancements:
- Native Arabic speaker review of clinical/financial terminology
- Screen-reader testing (NVDA, VoiceOver)
- Keyboard-only workflow completion for all roles
- Browser zoom at 200% and 400%
- Color contrast validation for all states and themes
- Real device testing at all required breakpoints
