# VIARA Portal Design System

## Visual direction
Professional diagnostic-care interface inspired by the clarity of CairoScan and TechnoScan, without cloning either site. The UI uses clinical navy for trust, teal for primary actions and active states, restrained coral for attention, and neutral blue-gray surfaces for readability.

## Core colors
- Navy foundation: `#08243D`; deep navy: `#041725`
- Primary teal: `#0E7C7B`; hover: `#0A6665`; soft: `#E8F6F4`
- Accent coral: `#EF6A5B`
- Canvas: `#F5F8FB`; surface: `#FFFFFF`; border: `#DCE5EC`
- Text: `#132536`; secondary: `#607286`
- Semantic states: success `#138A63`, warning `#B87314`, danger `#C8424F`, info `#2B70B7`

## Typography
- English: Manrope
- Arabic / RTL: Noto Sans Arabic
- Display headings use tight tracking; body copy uses comfortable 1.5–1.75 line height.

## Component rules
- Main cards: 16–24px radius depending on context; avoid mixed arbitrary radii.
- Inputs/buttons: minimum 44px touch height.
- Primary actions are teal. Coral is not used for ordinary actions.
- Status colors are only used to communicate status.
- Tables use subtle headers, numeric tabular alignment, and low-contrast row hover.
- Motion is short and purposeful; reduced-motion preferences are respected.

## QA checklist
- Test English and Arabic at 320, 375, 768, 1024, 1440 widths.
- Test light and dark themes on every route.
- Verify all focus states and keyboard navigation.
- Confirm no horizontal overflow except intentional data tables.
- Check text contrast, empty/loading/error states, modal stacking, and long translated labels.
