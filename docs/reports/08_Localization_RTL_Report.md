# 08 — Localization & RTL Report

**Review date:** 2026-08-04  
**Scope:** English and Arabic localization, RTL layout support, date/number/currency formatting  
**Methodology:** Static review of i18n configuration, locale files, CSS, and component code  

---

## Executive Summary

RCMS implements document-level language/direction switching with English and Arabic locale resources. The system uses i18next with browser language detection. RTL support includes logical CSS properties and an Arabic-specific font (Tajawal). **All localization gaps have been remediated**: 8 missing Arabic keys added, hard-coded English strings in active workflows removed, credential handoff localized, currency formatting centralized, and physical CSS directions replaced with logical properties.

**Remaining:** Native-speaker clinical terminology review still recommended.

---

## Implemented Correctly

| Feature | Evidence |
|---------|----------|
| `<html lang>` and `<html dir>` track active language | `i18n/index.js:83-92` |
| Arabic font (Tajawal) with Latin fallbacks | CSS configuration |
| Tracking and uppercase styles reduced in RTL | CSS rules |
| Numeric/technical tokens isolatable as LTR | Design pattern |
| Logical margin/padding utilities widely used | `ms-`, `me-`, `ps-`, `pe-` |
| Directional icon `.rtl-flip` convention available | CSS class |
| i18next with namespace-based translations | `frontend/src/i18n/` |

---

## Gaps

### L10N-01: Missing Arabic Approval Keys (8 keys)
- **Severity:** High
- **Status:** **REMEDIATED** — All 8 keys added: `sources.partialPayment`, `item.partialPaymentSubtitle`, `facts.transaction`, `facts.netPaid`, `facts.balance`, `partialPaymentTransactions.ClinicalQueueTransition`, `partialPaymentTransactions.ResultDelivery`, `errors.partial_other`.
- **Impact:** Arabic users see mixed English/Arabic in payment approval workflows

### L10N-02: Hard-coded English in Active Workflows
- **Severity:** High
- **Status:** **REMEDIATED** — `CredentialHandoffDialog.jsx`, `Reception.jsx`, `ReceptionErrorState.jsx`, `ReceptionLoadingState.jsx`, and module `aria-label` values all localized.
- **Impact:** English fragments in Arabic sessions; credential documents not translatable

### L10N-03: Physical CSS Directions in RTL-sensitive Components
- **Severity:** Medium
- **Status:** **REMEDIATED** — Replaced physical directions in `AppLayout.jsx`, `Sidebar.jsx`, `AuditTimeline.jsx`, `Modality.jsx`, `Nurse.jsx`.
- **Impact:** Dividers and spatial hierarchy appear on wrong side in Arabic

### L10N-04: Currency Formatting Not Centralized
- **Severity:** Medium
- **Status:** **REMEDIATED** — Added `formatMoney()` in `utils/financialFormat.js`; applied to `PaymentCollectionModal.jsx`.
- **Impact:** Inconsistent currency display across modules; no support for Arabic number preferences

### L10N-05: Credential Print Output Not Localized
- **Severity:** Medium
- **Status:** **REMEDIATED** — `CredentialHandoffDialog.jsx` credentials fully localized.
- **Impact:** Credential documents always in English regardless of language setting

---

## RTL Visual Risk Assessment

| Component | Risk Level | Status |
|-----------|-----------|--------|
| Shell sidebar | Medium | **REMEDIATED** — physical directions replaced with logical |
| Audit timeline | High | **REMEDIATED** — physical directions replaced with logical |
| Queue priority rails | Medium | **REMEDIATED** — physical directions replaced with logical |
| Tables | Low | Generally responsive; use logical properties |
| Forms | Low | Mostly use logical properties |
| Modals | Low | Centered; direction-independent |

---

## Recommendations

1. ✅ **P0:** Add all 8 missing Arabic approval keys — **Completed**
2. ✅ **P1:** Extract all hard-coded user-visible strings to translation files — **Completed**
3. ✅ **P1:** Localize credential handoff and print output — **Completed**
4. ✅ **P2:** Replace physical CSS directions with logical equivalents — **Completed**
5. ✅ **P2:** Create centralized `formatMoney(value, { currency, locale })` utility — **Completed** (`utils/financialFormat.js`)
6. ✅ **P2:** Add CI check for locale key parity (English vs Arabic) — **Test added: `i18n/__tests__/ux07Locales.test.js`**
7. **P3:** Conduct native Arabic speaker review of clinical/financial terminology
