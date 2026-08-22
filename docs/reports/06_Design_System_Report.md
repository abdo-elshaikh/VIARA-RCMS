# 06 — Design System Report

**Review date:** 2026-08-04  
**Scope:** Frontend and portal design tokens, shared components, and styling architecture  
**Methodology:** Static review of CSS, component files, and Tailwind configuration  

---

## Executive Summary

VIARA has a **solid design system foundation** with semantic color variables, shared UI primitives, and theme support. However, adoption is inconsistent — multiple pages define inline variants for components that already exist as shared primitives.

---

## Component Inventory

### Shared Primitives (frontend/src/components/ui/)

| Component | Purpose | Theme | RTL | A11y |
|-----------|---------|-------|-----|------|
| `Modal.jsx` | Dialog with focus trap | ✅ | ✅ | ✅ Focus management |
| `Button` | Standard actions | ✅ | ✅ | ✅ |
| `Input` | Text fields | ✅ | ✅ | Partial |
| `Select` | Dropdowns | ✅ | ✅ | Partial |
| `EmptyState` | No-data placeholder | ✅ | ✅ | ✅ |
| `SystemState` | Error/loading states | ✅ | ✅ | ✅ |

### Design Tokens

**Color system (`index.css`):**
- Semantic variables: canvas, surface, field, line, text, accent
- Light/dark mode support via CSS custom properties
- Legacy palette compatibility layer (lines 121-169)
- High contrast mode support

**Typography:**
- System font stack with Inter for Latin, Tajawal for Arabic
- Font scale control (small/medium/large)
- RTL-aware letter-spacing reduction

**Spacing:**
- Density control (compact/normal/comfortable)

**Motion:**
- `prefers-reduced-motion` support (`index.css:184,270-277`)
- Configurable motion preferences

---

## Inconsistencies Found

| Issue | Examples | Impact |
|-------|----------|--------|
| Inline button styles | CashDrawerReconciliation, PaymentCollectionModal | Visual inconsistency |
| Custom dialog patterns | CaseReports.jsx creates independent `role="dialog"` structures | Accessibility gaps |
| Mixed border-radius | Some modules use `rounded-none`, shared primitives use rounded | Visual inconsistency |
| Local spinner implementations | Multiple pages define their own loading indicators | Redundant code |
| Currency formatting | Each module creates separate `Intl.NumberFormat` instances | Inconsistent formatting |

---

## Design Debt

1. **Legacy palette compatibility CSS** — 50+ lines compensating for old color usage
2. **Duplicate dialog implementations** — at least 3 beyond the shared Modal
3. **Inconsistent disabled/loading states** — varies by module
4. **No component documentation** — no Storybook or equivalent
5. **No visual regression testing** — no automated screenshot comparison

---

## Recommendations

1. Publish approved primitive inventory and deprecate inline copies
2. Create `TransactionalAction` pattern for mutation state management
3. Build accessible `Drawer` component for mobile navigation
4. Create unified `DataTable` with responsive card fallback
5. Add shared `formatMoney`, `formatDate` utilities
6. Consider adding Storybook for component documentation
