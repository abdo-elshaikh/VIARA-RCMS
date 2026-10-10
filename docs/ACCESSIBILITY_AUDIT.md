# Accessibility Audit Report — VIARA RCMS
**Task:** M-07 — WCAG 2.1 AA Accessibility Improvements  
**Date:** 2026-08-29  
**Scope:** `frontend/src/` — components and pages

---

## Executive Summary

A systematic WCAG 2.1 AA audit was performed across the VIARA frontend codebase.
The audit covered five categories: contrast, alt text, form labels, focus indicators, and keyboard navigation.
The codebase is generally well-structured for accessibility — it has a global `:focus-visible` rule, ARIA attributes on interactive elements, focus trap hooks in modals, and RTL support throughout.
The primary issues found were **weak or suppressed focus indicators** on form controls using `outline-none` without a visible replacement ring, and a small number of **buttons missing `type="button"`**.

---

## Checks Performed

| Check | Method |
|---|---|
| Low contrast text (`text-gray-400`/`text-gray-300`) | Regex search across all `.jsx` files |
| Missing `alt` on `<img>` elements | Regex search for `<img` patterns |
| Missing form labels (`<input>` without `aria-label` or `<label>`) | Regex search; manual inspection |
| Focus indicators (`outline-none` without replacement) | Regex + visual pattern analysis |
| Keyboard nav (`onClick` on `<div>`/`<span>` without `role`/`tabIndex`) | Regex search |
| Buttons missing `type` attribute | Manual code review |

---

## Issues Found and Fixed

### 1. Focus Indicators (WCAG 2.4.7 — Focus Visible)

The project uses a global `:focus-visible` rule in `index.css` that applies an accent-colored outline to all interactive elements. However, Tailwind's `outline-none` class overrides this when applied to an element without adding a replacement visible indicator. The following files were fixed:

| File | Issue | Fix Applied |
|---|---|---|
| `frontend/src/components/dashboard/GlobalSearch.jsx` | Topbar search `<input>` had `outline-none` with no ring (only CSS border color change) | Added `focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] focus-visible:ring-offset-1` |
| `frontend/src/components/ui/SearchInput.jsx` | Clear button missing `type="button"` and focus ring | Added `type="button"` and `focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)]` |
| `frontend/src/components/communications/ChatBubble.jsx` | Message compose `<input>` had `outline-none` with no visible focus | Added `focus-visible:ring-1 focus-visible:ring-teal-500 focus-visible:ring-offset-1` |
| `frontend/src/components/crm/CampaignManager.jsx` | Patient search `<input>` had `outline-none` (standalone, no focus-within container) | Added `focus:ring-2 focus:ring-pink-400 focus:border-pink-400` |
| `frontend/src/components/hr/attendance/AttendancePermissionsDrawer.jsx` | Permission type filter `<select>` had `outline-none` | Added `focus:ring-2 focus:ring-teal-400 focus:border-teal-400` |
| `frontend/src/components/equipment/MaintenanceManager.jsx` | Status `<select>` had `outline-none` | Added `focus:ring-2 focus:ring-teal-400` |
| `frontend/src/components/hr/ProductivityReport.jsx` | Two date `<input>` fields inside a static (not focus-within) container had `outline-none` | Added `focus-visible:ring-1 focus-visible:ring-teal-500` on both |
| `frontend/src/pages/IntegrationSettings.jsx` | Two standalone date `<input>` fields with `outline-none` | Added `focus:ring-2 focus:ring-teal-400 focus:border-teal-400` |
| `frontend/src/pages/CenterSettings.jsx` | Branch preview context `<select>` with `outline-none` | Added `focus:ring-2 focus:ring-teal-400 focus:border-teal-400` |
| `frontend/src/pages/Nurse.jsx` | Date `<input>` with `outline-none cursor-pointer` (standalone) | Added `focus-visible:ring-1 focus-visible:ring-[var(--VIARA-accent)] focus-visible:rounded` |
| `frontend/src/pages/Modality.jsx` | Date `<input>` with `outline-none cursor-pointer` (standalone) | Added `focus-visible:ring-1 focus-visible:ring-[var(--VIARA-accent)] focus-visible:rounded` |
| `frontend/src/components/equipment/EquipmentWorkstationMapping.jsx` | Workstation name `<input>` had `outline-none` with only a border color change (no ring) | Added `focus:ring-2 focus:ring-teal-200 / focus:ring-rose-200` |

### 2. Weak Focus Ring Opacity (WCAG 2.4.7)

Focus rings using `/10` opacity are barely perceptible. Updated to `/30` for better visibility:

| File | Issue | Fix Applied |
|---|---|---|
| `frontend/src/components/auth/BreakGlassModal.jsx` | `focus:ring-red-500/10` on emergency access fields (10% opacity, nearly invisible) | Changed to `focus:ring-2 focus:ring-red-500/30` |
| `frontend/src/components/clinical/EditSafetyDialog.jsx` | All safety selects used `focus:ring-[color]/10` | Changed to `focus:ring-2 focus:ring-[color]/30` |
| `frontend/src/components/clinical/EditComplaintDialog.jsx` | Complaint textarea used `focus:ring-4 focus:ring-blue-500/10` | Changed to `focus:ring-2 focus:ring-blue-500/30` |
| `frontend/src/components/clinical/CancelReasonDialog.jsx` | Reason textarea used `focus:ring-4 focus:ring-rose-100` | Changed to `focus:ring-2 focus:ring-rose-300` |
| `frontend/src/components/clinical/HoldReasonDialog.jsx` | Reason textarea used `focus:ring-4 focus:ring-*-100` | Changed to `focus:ring-2 focus:ring-*-300` |

### 3. Buttons Missing `type` Attribute (WCAG best practice / HTML spec)

`<button>` elements without `type="button"` inside forms default to `type="submit"`, which can cause accidental form submission.

| File | Issue | Fix Applied |
|---|---|---|
| `frontend/src/components/clinical/EditComplaintDialog.jsx` | Close, cancel, and confirm buttons lacked `type` attribute; close button also lacked `aria-label` | Added `type="button"` to all three; added `aria-label="Close dialog"` to close button |
| `frontend/src/components/clinical/EditSafetyDialog.jsx` | Cancel and confirm buttons lacked `type` attribute | Added `type="button"` to both |

---

## Issues Not Fixed (Acceptable or Require Human Testing)

### Inline Input in Focus-Within Containers

Several inputs intentionally omit `outline-none`'s ring because the **parent container** shows a `focus-within:ring` and `focus-within:border` change that acts as the focus indicator. This is an accessible pattern. Examples:

- `BookAppointment.jsx` patient search — inside `focus-within:ring-4 focus-within:ring-teal-500/10` container
- `AttendanceManager.jsx` search input — inside a bordered container
- `CommunicationCenter.jsx` various inputs — have explicit `focus-visible:ring-2` already
- `GeneralLedger.jsx`, `DiscountReports.jsx` — inputs inside `focus-within:ring` containers

### Programmatic Focus Target (Not Interactive)

`PendingRequests.jsx` uses `tabIndex={-1}` with `outline-none` on an `<article>` that is programmatically focused as a scroll target, not by the user's keyboard. This is correct usage of `outline-none`.

### Low Contrast: `text-gray-400` / `text-gray-300`

No instances of `text-gray-400` or `text-gray-300` on primary text content (non-placeholder) on white backgrounds were found in component files. These classes appear exclusively on:
- Placeholder text (correct — lower contrast for placeholders is acceptable under WCAG)
- Icons (`aria-hidden="true"`)
- Secondary/muted supplemental text

### Decorative Images

All `<img alt="">` instances are decorative logos or fallback graphics (shown alongside text labels), which correctly use empty alt. Non-decorative images (QR codes, previews) already have descriptive alt text.

### Div/Span `onClick` Patterns

The `<div onClick>` patterns found are all:
- **Modal backdrop dismiss overlays** — with `aria-hidden="true"` or correctly positioned behind the dialog
- **Event propagation stoppers** (`onClick={e => e.stopPropagation()}`) — not interactive elements themselves

These are correct and do not require `role="button"` or `tabIndex`.

---

## Issues Requiring Human Testing with Assistive Technologies

The following cannot be validated without manual testing with screen readers (NVDA, JAWS, VoiceOver) and keyboard-only navigation:

1. **Screen reader announcement of dynamic content** — Worklist updates, queue notifications, and real-time chat messages should be announced via live regions (`aria-live`). This requires runtime testing.

2. **Focus management in modals** — The `useFocusTrap` hook is implemented; verify that focus returns to the trigger element when modals close in all scenarios.

3. **PACS Viewer keyboard accessibility** — The DICOM viewer (`PacsViewer.jsx`) has complex pointer-driven interactions. Full keyboard equivalents need testing.

4. **Color-only information** — Status badges (e.g., appointment status colors) may convey information through color alone. Verify screen reader text equivalents are provided for all status indicators.

5. **Print components** — `PrintDocument.jsx`, `PrintInvoice.jsx`, etc. are rendered in print context. Verify they don't cause issues in accessibility trees.

6. **RTL focus order** — The application supports Arabic RTL layouts. Verify logical tab order matches visual order in RTL mode.

7. **Complex custom widgets** — The drag-and-drop scheduler (`Scheduler.jsx`), date pickers with inline inputs, and the report editor rich text component need manual keyboard/screen reader testing.

8. **Touch and mobile accessibility** — Many components have mobile-specific layouts that need testing with iOS VoiceOver and Android TalkBack.

---

## Recommendations for Full WCAG 2.1 AA Audit

### High Priority

1. **Automated scan baseline** — Run axe-core or Lighthouse accessibility audits in CI against representative pages. This catches ~30–40% of issues automatically.

2. **Color contrast audit tool** — Use a contrast checker (e.g., `@accessibleweb/contrast-checker`, Figma plugin) to systematically verify all color combinations — especially the theme variables (`--VIARA-muted`, `--VIARA-ink-soft`) against their backgrounds.

3. **Live region audit** — Review all toast notifications, async operation results, and queue updates. Ensure critical status changes are announced by `aria-live="polite"` or `assertive` regions. The `ToastHub` component has `aria-label="Notifications"` on its container but individual toasts lack `role="status"`.

4. **Focus return policy** — Establish a consistent pattern for returning focus when modals close, overlays dismiss, or navigation occurs. Document this in the component API.

### Medium Priority

5. **Skip navigation link** — Add a "Skip to main content" link as the first focusable element in `AppLayout.jsx` for keyboard users who need to bypass the sidebar navigation.

6. **Heading hierarchy** — Verify that heading levels (`h1`–`h6`) follow a logical hierarchy on each page. The sidebar uses `<h1>` for the center name and various components use `<h2>`, `<h3>` — these should be audited per-page.

7. **Form validation announcements** — Review all form validation error messages. They should use `role="alert"` (already implemented in the `Input` component) and focus management on validation failure.

8. **Icon-only buttons** — The `Button` component correctly adds `<span className="sr-only">` for icon-only buttons. Verify all custom icon buttons outside the Button component also have accessible names.

### Lower Priority

9. **Reduced motion** — The codebase already uses `motion-reduce:animate-none` in some places. Complete a sweep to ensure all `animate-*` classes have reduced-motion equivalents for users who have `prefers-reduced-motion: reduce` set.

10. **Keyboard shortcuts documentation** — The `KeyboardShortcutsHelp` component exists. Ensure all global shortcuts (`⌘K`, `/`, etc.) are accessible from it and don't conflict with AT shortcuts.

11. **PDF/print outputs** — Ensure generated print documents (`PrintDocument.jsx`, `PrintInvoice.jsx`) have sufficient text size and contrast for users with low vision who may print to read.

---

## Files Modified

1. `frontend/src/components/dashboard/GlobalSearch.jsx`
2. `frontend/src/components/ui/SearchInput.jsx`
3. `frontend/src/components/communications/ChatBubble.jsx`
4. `frontend/src/components/crm/CampaignManager.jsx`
5. `frontend/src/components/hr/attendance/AttendancePermissionsDrawer.jsx`
6. `frontend/src/components/equipment/MaintenanceManager.jsx`
7. `frontend/src/components/hr/ProductivityReport.jsx`
8. `frontend/src/pages/IntegrationSettings.jsx`
9. `frontend/src/pages/CenterSettings.jsx`
10. `frontend/src/pages/Nurse.jsx`
11. `frontend/src/pages/Modality.jsx`
12. `frontend/src/components/equipment/EquipmentWorkstationMapping.jsx`
13. `frontend/src/components/auth/BreakGlassModal.jsx`
14. `frontend/src/components/clinical/EditSafetyDialog.jsx`
15. `frontend/src/components/clinical/EditComplaintDialog.jsx`
16. `frontend/src/components/clinical/CancelReasonDialog.jsx`
17. `frontend/src/components/clinical/HoldReasonDialog.jsx`
18. `frontend/docs/ACCESSIBILITY_AUDIT.md` (this file)

---

*Full WCAG 2.1 AA compliance requires manual testing with assistive technologies and expert review. This audit addresses the most common programmatic issues identified through static analysis.*
