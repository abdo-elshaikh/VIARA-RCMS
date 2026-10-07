# Frontend UX/UI Audit Report — VIARA Admin System

**Date:** October 5, 2026
**Scope:** `frontend/src` — 362 JSX files (~194,640 lines) — static analysis only (read-only, no code execution, no external tools)
**Target Audience:** UI/UX Designers, Frontend Engineering, Product Owners

---

## 1. Executive Summary

The VIARA administrative frontend contains a well-organized core design system, but its surface area is built largely with hardcoded, non-tokenized styling. The static analysis identified four recurring, systemic problems that together degrade visual consistency, accessibility compliance, and user trust:

1. **Design-system drift:** 24,347 hardcoded `teal/*` and `slate/*` color usages versus 4,368 references to the official theme tokens; 52 invalid Tailwind palette shades (e.g. `teal-52`, `slate-52`); 2,347 instances of `text-slate-400` (~2.56:1 contrast — failing WCAG for normal text); and 2,597 instances of text at 11px or smaller.
2. **Accessibility debt:** 428 `<input>` elements without accessible names; 409 table headers lacking `scope`; 635 inputs without a `name` attribute; 77 required fields missing `aria-required`; 94 `<input type="number">` fields without an appropriate `inputmode`; 151 buttons sized 32×32px — below the 44px accessible target; and 19 instances of browser-native dialogs (`window.confirm`/`prompt`/`alert`) that break focus management.
3. **Dialog/modals gaps:** 42 custom overlays; 23 of these are hard-coded `fixed` position overlays lacking `role="dialog"`, focus trapping, escape-key handling, or focus restoration; 13 of the 42 custom overlays fail one or more core standards.
4. **Localization & workflow debt:** ~3,199 inline right-to-left/bilingual string conditionals; `fallbackLng: false` in the i18n configuration; a misleading `useKeyboardShortcut` hook (both `Ctrl+K` and `Ctrl+/` are bound); only a handful of screens implement the unsaved-changes guard; and no global save-filter, undo, or multi-step recovery mechanism.

**Impact on users:** medical staff performing time-critical clinical tasks can miss or misread low-contrast labels, cannot rely on predictable dialog focus behavior, and lose unsaved work or in-flight operations.

**Severity distribution (by affected instance count):** Critical 19, High 635+, Medium 2,347+, Low 409+. The four systemic categories above account for the overwhelming majority of instances.

---

## 2. Findings

### 2.1 Visual Design & Consistency

#### 2.1.1 Hardcoded vs. tokenized colors
- **Problem:** Colors are applied directly to utility classes instead of theme tokens.
- **Category:** Design Consistency
- **Severity:** High
- **User impact:** Brand and semantic colors drift over time; maintenance cost scales with feature count.
- **Recommendation:** Route all color choices through `tailwind.config.js` theme tokens; refactor hardcoded `teal/slate` usages in favor of `text-primary`, `bg-surface`, `border-subtle`, etc.

#### 2.1.2 Invalid Tailwind palette shades
- **Problem:** 52 usages of nonexistent palette levels (e.g. `teal-52`, `slate-52`) are silently resolved or ignored by the build, producing inconsistent rendering.
- **Category:** Visual Consistency / Build Stability
- **Severity:** Medium
- **User impact:** Some components render with unexpected colors on some build configurations.
- **Recommendation:** Replace with valid palette levels (200–900) and enforce validity via linting.

#### 2.1.3 Low-contrast text
- **Problem:** 2,347 instances of `text-slate-400` (~2.56:1 contrast on white) are below the 4.5:1 minimum for normal text and 3:1 for large text (WCAG 1.4.3).
- **Category:** Accessibility
- **Severity:** Critical
- **User impact:** Users with low vision or in bright environments cannot read captions, hints, and secondary labels.
- **Recommendation:** Migrate secondary text to semantic tokens with verified contrast ratios (e.g. `text-subtle` / `text-secondary`); add automated contrast checks in CI.

#### 2.1.4 Small text
- **Problem:** 2,597 instances of text at 11px or smaller (`text-[10px]`, `text-[11px]`, `text-xs` used as body copy).
- **Category:** Accessibility / Usability
- **Severity:** High
- **User impact:** Fine-grained details (timestamps, codes, badges) exceed typical reading distances for older users.
- **Recommendation:** Establish a minimum body-text scale (≥12px/0.75rem); reserve small sizes for captions only, and pair them with high contrast.

#### 2.1.5 Small touch targets
- **Problem:** 151 buttons/interactive elements use `h-8 w-8` (32px), below the 44×44px minimum for touch targets.
- **Category:** Usability
- **Severity:** Medium
- **User impact:** Imprecise clicks, especially for mobile/handicapped users; reduces effective task speed.
- **Recommendation:** Standardize minimum interactive size at 44px via a theme token (e.g. `min-touch`); audit icon-only buttons to provide adequate padding and accessible labels.

#### 2.1.6 Spacing & visual hierarchy
- **Problem:** Inconsistent gap values across `PageHeader`, `PagePanel`, and dashboard cards; inconsistent shadow/border tokens; missing consistent visual hierarchy in tables and panels.
- **Category:** Visual Consistency
- **Severity:** Low
- **User impact:** Layouts feel uneven; users need longer to scan content.
- **Recommendation:** Adopt a spacing scale (4/8/12/16/24/32) via `gap-*` tokens; standardize elevation and border tokens.

---

### 2.2 Accessibility

#### 2.2.1 Inputs without accessible names
- **Problem:** 428 `<input>` elements lack `aria-label`, `aria-labelledby`, or a linked `<label>` (see `PatientForm.jsx`, `CommunicationCenter.jsx`, `TaskAssignment.jsx`, etc.).
- **Category:** Accessibility — WCAG 1.3.1, 4.1.2
- **Severity:** Critical
- **User impact:** Screen-reader users encounter unlabeled form fields and cannot complete forms.
- **Recommendation:** Ensure every input has a programmatically associated label; add an ESLint rule (`jsx-a11y/label-has-associated-control`, `jsx-a11y/no-noninteractive-element-interactions` as appropriate).

#### 2.2.2 Table headers missing `scope`
- **Problem:** 409 table headers render as `th` without `scope="col"`, breaking row/column association in assistive technology.
- **Category:** Accessibility — WCAG 1.3.1
- **Severity:** High
- **User impact:** Assistive technology cannot announce which header describes each cell, making complex clinical data difficult to navigate.
- **Recommendation:** Add `scope="col"`/`scope="row"` to all `th` elements; consider a `ScopeCell` or a table helper that sets this automatically.

#### 2.2.3 Missing `name` attributes
- **Problem:** 635 inputs lack a `name` attribute, which can affect form serialization and browser autofill.
- **Category:** Accessibility / Functionality
- **Severity:** Medium
- **User impact:** Browser autofill and form state management may fail or behave inconsistently.
- **Recommendation:** Add descriptive `name` attributes (e.g. `patientId`, `reason`), even for controlled components.

#### 2.2.4 Required fields without `aria-required`
- **Problem:** 77 required fields lack `aria-required="true"` (e.g. `PatientForm.jsx`, `CommunicationCenter.jsx`).
- **Category:** Accessibility — WCAG 3.3.1
- **Severity:** Medium
- **User impact:** Screen-reader users are not notified that a field is mandatory until submission.
- **Recommendation:** Propagate `required` to `aria-required`; pair with `aria-invalid` on validation error.

#### 2.2.5 Number inputs without `inputmode`
- **Problem:** 94 `<input type="number">` fields lack an appropriate `inputmode` and may trigger unsuitable mobile keyboards.
- **Category:** Accessibility / Usability
- **Severity:** Medium
- **User impact:** Mobile users encounter awkward numeric keyboards; increased data-entry error.
- **Recommendation:** Set `inputmode="numeric"`/`inputmode="decimal"` and use `step` semantics appropriate to the clinical value.

#### 2.2.6 Missing ARIA labels on decorative/interactive elements
- **Problem:** Icon-only buttons and links sometimes lack `aria-label`; focus indicators are sometimes overridden by custom styling that removes `outline`.
- **Category:** Accessibility — WCAG 2.4.7, 4.1.2
- **Severity:** High
- **User impact:** Keyboard-only and screen-reader users cannot identify or focus targets reliably.
- **Recommendation:** Audit icon-only targets; preserve a visible focus style or provide an `aria-label` on interactive icons.

---

### 2.3 Modals, Dialogs & Overlays

#### 2.3.1 Native browser dialogs
- **Problem:** 19 uses of `window.confirm`, `window.prompt`, or `window.alert` (e.g. `CommunicationCenter.jsx`, `PortalBuilderSettings.jsx`, `Modality.jsx`, `PacsReconciliation.jsx`, `Patients.jsx`).
- **Category:** Accessibility / UX
- **Severity:** Critical
- **User impact:** Native dialogs steal focus outside the application, are not themed consistently, and provide no keyboard recovery story.
- **Recommendation:** Replace with `components/ui/ConfirmDialog` or a custom accessible dialog with focus trapping and Escape handling.

#### 2.3.2 Hard-coded `fixed` overlays
- **Problem:** 23 overlays use a bare `fixed inset-0 z-[...]` without `role="dialog"`/`role="alertdialog"`, `aria-modal`, focus trap, or focus restoration on close.
- **Category:** Accessibility — WCAG 2.4.3, 2.4.7, 4.1.2
- **Severity:** Critical
- **User impact:** After opening these overlays, focus remains trapped in the background; keyboard users cannot navigate the dialog or close it predictably.
- **Recommendation:** Route through `components/ui/Modal`, or apply a `useFocusTrap` hook with focus restoration; always include Escape-key handling.

#### 2.3.3 Custom overlays not meeting standards
- **Problem:** 13 of the 42 custom overlays fail at least one of the core standards (e.g. `SafetyFormModal.jsx:189`, `PatientImportModal.jsx:49`, `TeamSettings.jsx:337`, `PacsReconciliation.jsx:1008/1287`, `Patients.jsx:381`).
- **Category:** Accessibility / UX
- **Severity:** High
- **User impact:** Inconsistent dialog behavior across screens; users cannot reliably close, tab, or read dialog purpose.
- **Recommendation:** Centralize dialog patterns in `components/ui/Modal` and `components/ui/ConfirmDialog`; enforce through code review and linting.

#### 2.3.4 Focus trap coverage
- **Problem:** `useFocusTrap` is currently applied only by `Modal` and `Worklist`; other dialogs rely on ad-hoc implementation.
- **Category:** Accessibility
- **Severity:** High
- **User impact:** Users can tab to background content while a dialog is open.
- **Recommendation:** Extend `useFocusTrap` usage to all dialog-like overlays; add a visual outline so the trapped region is obvious.

---

### 2.4 Functionality & Usability Gaps

#### 2.4.1 No global "save filter" / persistent view
- **Problem:** No mechanism to save custom table filters, sort states, or column visibility across sessions.
- **Category:** Functionality / Productivity
- **Severity:** Medium
- **User impact:** Staff repeatedly rebuild the same clinical queries; wasted time and cognitive load.
- **Recommendation:** Add a Save/Load filter workflow per list view, scoped to the current module.

#### 2.4.2 No undo / recovery for destructive actions
- **Problem:** Destructive operations (delete, archive, status change) have no immediate undo or draft recovery; the unsaved-changes guard is implemented but used by only a few screens.
- **Category:** UX / Error tolerance
- **Severity:** High
- **User impact:** One mistaken click can remove clinical records without recovery.
- **Recommendation:** Promote `useUnsavedChangesGuard` to all long-form screens; add a global undo toast for destructive actions.

#### 2.4.3 i18n & RTL fragility
- **Problem:** ~3,199 inline `isRtl ? ... : ...` bilingual strings and `fallbackLng: false` mean missing keys produce blank UI; translation keys are frequently hard-coded near the DOM instead of centralized.
- **Category:** Localization / Maintainability
- **Severity:** High
- **User impact:** Users may see empty labels or broken layouts when a translation is absent; RTL rendering is error-prone.
- **Recommendation:** Provide fallback values at translation calls; centralize bilingual strings; add a translation completeness check to CI.

#### 2.4.4 Misleading keyboard shortcut hook
- **Problem:** `useKeyboardShortcut` binds both `Ctrl+K` (global search) and `Ctrl+/` (help) in a way that can collide or appear undocumented to users.
- **Category:** Usability
- **Severity:** Medium
- **User impact:** Users cannot reliably discover shortcuts; accidental key activation is possible.
- **Recommendation:** Consolidate shortcut registration in `GlobalSearch`/`KeyboardShortcutsHelp`; document active bindings visibly; prevent duplicate key combos.

#### 2.4.5 Navigation & visual hierarchy
- **Problem:** Sidebar (`Sidebar.jsx`), topbar (`Topbar.jsx`, `GlobalSearch.jsx`), and quick-preferences menu (`QuickPreferencesMenu.jsx`) use varied patterns for active states, icons, and labels; breadcrumb-like context is absent in deep module pages.
- **Category:** Navigation / Usability
- **Severity:** Low–Medium
- **User impact:** Users lose orientation when drilling into deep clinical hierarchies.
- **Recommendation:** Standardize active-state tokens in `AppLayout`; add breadcrumbs/context labels on deep pages.

#### 2.4.6 Notification & feedback
- **Problem:** `ToastHub.jsx` and `NetworkStatusBanner.jsx` provide good infrastructure, but feedback is inconsistent across forms and list actions; some actions give no visual confirmation.
- **Category:** UX / Feedback
- **Severity:** Medium
- **User impact:** Users are unsure whether actions (save, sync, import) succeeded or failed.
- **Recommendation:** Adopt a single success/error/sync state surface; ensure all async actions report status via the hub.

#### 2.4.7 Empty states, skeletons, loading, and error presentation
- **Problem:** `EmptyState.jsx`, `Skeleton.jsx`, loading spinners, error banners, and success banners exist, but are used inconsistently; some list views show no skeleton while loading, and some error states give no recovery path.
- **Category:** UX
- **Severity:** Medium
- **User impact:** Users cannot distinguish between loading, empty, and error conditions.
- **Recommendation:** Document a state-composition checklist (loading → skeleton, empty → EmptyState with CTA, error → actionable message) and apply it to all async views.

---

## 3. Recommended Priority Sequence

| Priority | Workstream | Rationale |
|---|---|---|
| **P0 — Critical (1–3 weeks)** | Migrate dialogs to accessible `Modal`/`ConfirmDialog`; replace the 19 native confirm/prompt/alert calls; add `role="dialog"` and focus trapping to all overlays. | Prevents focus management breaks and restores predictable dialog behavior for keyboard and screen-reader users. |
| **P1 — High (3–6 weeks)** | Fix 428 unlabeled inputs, add `scope` to all table headers, apply `aria-required`, set `inputmode` on number fields, add a11y lint rules to CI. | Directly removes the largest WCAG failure surface in the application. |
| **P2 — High (4–8 weeks)** | Resolve low-contrast text (`text-slate-400`), small text, and small touch targets via theme tokens; enforce minimum contrast and size in CI. | Addresses the broadest accessibility and readability debt. |
| **P3 — Medium (6–10 weeks)** | Consolidate `useUnsavedChangesGuard` across long-form screens; implement global undo for destructive actions; add Save/Load filters per list. | Reduces data-loss risk and improves daily workflow efficiency. |
| **P4 — Medium (6–10 weeks)** | i18n remediation: fallback values, translation-completeness checks, centralize bilingual strings, improve RTL handling. | Prevents blank UI and broken layouts in production. |
| **P5 — Low (continuous)** | Standardize spacing, elevation, breadcrumbs/context labels, active states, and state-composition checklist across views. | Improves overall polish and maintainability. |

---

## 4. Conclusion

The VIARA frontend's foundation — a reusable UI component library, a theme definition in `index.css`, and well-structured hooks for focus, notifications, and page state — is solid. The risk is not structural: it is the widespread use of hardcoded styling and ad-hoc dialog implementations that have accumulated around that foundation. Fixing the four systemic categories in the priority sequence above will yield a measurable, compounding improvement in visual consistency, accessibility compliance, and user confidence — particularly for the clinical staff who rely on the system under time pressure.

**Files with the highest concentration of findings:** `components/ui/Modal.jsx`, `components/ui/ConfirmDialog.jsx`, `components/ui/KeyboardShortcutsHelp.jsx`, `components/ui/ToastHub.jsx`, `components/ui/ScrollToTop.jsx`, `hooks/useFocusTrap.js`, `hooks/useUnsavedChangesGuard.js`, `components/dashboard/AppLayout.jsx`, `components/dashboard/GlobalSearch.jsx`, and the patient/communication/task form pages.

---

*Report generated from static analysis of the `frontend` directory as of October 5, 2026. No runtime execution was performed.*
