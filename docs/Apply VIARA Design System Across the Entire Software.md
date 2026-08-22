# AI Agent Prompt: Apply VIARA Design System Across the Entire Software

Act as a senior product designer, design-system architect, frontend engineer, accessibility specialist, and healthcare UX reviewer.

Your task is to redesign and refactor the entire application so that it consistently follows the **VIARA Healthcare Technology** visual identity across all modules, pages, states, and responsive layouts.

The redesign must preserve all existing functionality, routes, APIs, workflows, permissions, forms, business logic, validation, and integrations.

Do not replace working functionality with static mockups.

---

# 1. Brand Identity

Use the following identity as the source of truth:

**Brand Name:** VIARA  
**Descriptor:** Healthcare Technology  
**Primary Tagline:** A Better Way to Care.

The VIARA identity should communicate:

- Healthcare
- Trust
- Intelligence
- Connectivity
- Safety
- Modern technology
- Human-centered care

The final application should feel like a modern enterprise healthcare platform, not a generic admin dashboard.

---

# 2. VIARA Core Color Palette

Use centralized design tokens.

## Primary Brand

Emerald Green:

```css
--viara-primary: #087F5B;
--viara-primary-hover: #066A4C;
--viara-primary-active: #055A41;
--viara-primary-dark: #064E3B;
--viara-primary-light: #DDF4EA;
```

Use green for:

- Primary actions
- Active navigation
- Selected states
- Main brand surfaces
- Success-related emphasis
- Primary links
- Key progress indicators

Do not use green excessively.

---

## Amber Accent

```css
--viara-amber: #F4B942;
--viara-amber-hover: #DFA52F;
--viara-amber-light: #FFF4D6;
```

Use amber for:

- Warnings
- Attention
- AI insights
- Pending status
- Highlighted information
- Secondary accents

Do not use amber for normal paragraph text on white backgrounds.

---

## Coral Red

```css
--viara-coral: #D95757;
--viara-coral-hover: #C94848;
--viara-coral-light: #FCE8E8;
```

Red must remain semantically meaningful.

Use only for:

- Critical findings
- Errors
- Emergency states
- Failed operations
- Destructive actions
- High-risk alerts

Do not use red as a normal decorative or primary-action color.

---

# 3. Neutral Palette

## Light Theme

```css
--background: #F7FAF9;
--surface: #FFFFFF;
--surface-secondary: #F0F5F3;
--surface-muted: #E9F0ED;

--border: #DCE7E3;
--border-strong: #C3D2CD;

--text-primary: #172326;
--text-secondary: #5F6F6B;
--text-muted: #8B9995;
--text-inverse: #FFFFFF;
```

The interface should primarily use:

**Soft White + Charcoal + Emerald**

Amber and coral should be accents only.

---

# 4. Dark Theme

Do not invert the light theme.

Use a dedicated dark clinical palette:

```css
[data-theme="dark"] {
  --background: #091310;
  --surface: #101D19;
  --surface-secondary: #172722;
  --surface-muted: #1C2E28;

  --border: #294039;
  --border-strong: #365148;

  --text-primary: #F3F8F6;
  --text-secondary: #B6C5C0;
  --text-muted: #82948E;

  --viara-primary: #2EAE82;
  --viara-primary-hover: #42BD91;
  --viara-primary-active: #27956F;
  --viara-primary-light: #143B2F;

  --viara-amber: #F4B942;
  --viara-coral: #E56868;
}
```

Dark mode must be comfortable for long clinical sessions.

Avoid:

- Pure black backgrounds
- Neon green
- Excessive glow
- Strong gradients
- High-saturation surfaces

---

# 5. PACS / Medical Viewer Theme

The PACS viewer must use a dedicated neutral dark clinical theme.

Image-viewing areas must remain visually neutral.

Do not apply brand green, amber, or red as a tint over medical images.

Recommended viewer background:

```css
--viewer-bg: #070A09;
--viewer-panel: #111615;
--viewer-border: #252C2A;
--viewer-text: #DDE5E2;
```

Brand colors should only appear in:

- Controls
- Status indicators
- Selected tools
- Alerts
- Navigation

Diagnostic image presentation must remain color-neutral.

---

# 6. Semantic Colors

Do not confuse brand colors with status colors.

Use:

```css
--success: #16865F;
--success-bg: #E5F5EE;

--warning: #D99A18;
--warning-bg: #FFF4D6;

--danger: #D95757;
--danger-bg: #FCE8E8;

--info: #327C92;
--info-bg: #E5F2F5;
```

Status colors must always include text, icon, or label.

Never communicate meaning using color alone.

---

# 7. Typography

Use a clean modern sans-serif family appropriate for healthcare software.

Preferred:

- Inter
- IBM Plex Sans
- Noto Sans
- Noto Sans Arabic

For Arabic, use a font with excellent readability at small UI sizes.

Recommended Arabic:

**Noto Sans Arabic**

Maintain consistent typography scale.

Example:

```text
Display        40–48px
H1             32px
H2             24px
H3             20px
Body Large     16px
Body           14px
Small          12px
Caption        11px
```

Avoid tiny text below comfortable readability.

---

# 8. Spacing System

Create a consistent spacing scale.

```text
4
8
12
16
20
24
32
40
48
64
```

Do not use random spacing values unless necessary.

Ensure:

- Consistent page padding
- Consistent card spacing
- Consistent form spacing
- Consistent table density
- Predictable modal layouts

---

# 9. Border Radius

Use restrained modern rounding.

Recommended:

```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-xl: 18px;
```

Avoid excessive pill-shaped controls unless appropriate.

---

# 10. Shadows

Use soft and minimal shadows.

Recommended:

```css
--shadow-sm: 0 1px 2px rgba(23,35,38,.06);
--shadow-md: 0 4px 12px rgba(23,35,38,.08);
--shadow-lg: 0 10px 30px rgba(23,35,38,.12);
```

Do not create floating cards everywhere.

Prefer border + subtle shadow.

---

# 11. Global Application Shell

Redesign the shared shell.

Include:

- VIARA logo
- Clear page title
- Breadcrumbs
- Search
- Notifications
- User profile
- Language switcher
- Theme switcher
- Responsive navigation

Desktop:

- Clean sidebar
- Compact header
- Spacious content

Mobile:

- Collapsible navigation
- Bottom navigation or drawer where appropriate
- Easy access to primary actions

---

# 12. Sidebar

Use deep green / charcoal surfaces.

Example:

```css
background:
linear-gradient(
  180deg,
  #063E30,
  #0B1F1A
);
```

Active item:

- Emerald surface
- White text
- Clear icon

Hover:

- Subtle green tint

Do not use heavy gradients or glow effects.

---

# 13. Buttons

Create consistent variants.

## Primary

Emerald background.

## Secondary

Neutral surface with border.

## Destructive

Coral red.

## Ghost

Transparent.

## Warning

Amber only when semantically justified.

Every button must support:

- Default
- Hover
- Focus
- Active
- Disabled
- Loading

---

# 14. Cards

Cards should use:

- White or neutral dark surface
- Subtle border
- Minimal shadow
- Clear hierarchy
- Consistent radius

Avoid:

- Too many nested cards
- Excessive gradients
- Decorative colored backgrounds everywhere

---

# 15. Forms

Standardize:

- Input height
- Labels
- Placeholder
- Error states
- Helper text
- Required indicators
- Validation
- Disabled states

Recommended input height:

```text
40–44px desktop
44–48px touch interfaces
```

Focus ring:

```css
box-shadow:
0 0 0 3px rgba(8,127,91,.15);
```

Errors use coral red.

---

# 16. Tables

Optimize for healthcare workflows.

Requirements:

- Clear headers
- Sticky headers when useful
- Row hover
- Selected row
- Status badges
- Sorting
- Filtering
- Pagination
- Search
- Bulk actions
- Responsive behavior

Use color sparingly.

Critical patient or study states may use coral.

Pending may use amber.

Completed may use green.

---

# 17. Status Badges

Use compact soft-background badges.

Example:

Completed:

```text
Green text + pale green background
```

Pending:

```text
Amber text + pale amber background
```

Critical:

```text
Coral text + pale coral background
```

Cancelled:

```text
Neutral gray or muted red depending on meaning
```

---

# 18. Dashboard

Redesign dashboards with:

- High-value KPIs first
- Clear hierarchy
- Reduced visual noise
- Actionable alerts
- Consistent charts
- Useful trend indicators

Prioritize:

- Total studies
- Critical findings
- Reports completed
- AI findings
- Pending workload
- Operational alerts

Avoid creating a wall of metrics.

---

# 19. Charts

Charts must work in both themes.

Use:

- Emerald as primary series
- Amber for attention
- Coral for critical
- Neutral gray for comparison

Do not use large rainbow palettes unless data categories genuinely require them.

Ensure accessible contrast.

---

# 20. AI Features

AI should have a clear but restrained visual identity.

Use amber as a supporting accent for:

- AI suggestion
- AI detection
- AI recommendation
- AI-generated insight

Always visually distinguish:

- AI suggestion
- Confirmed clinical result

Never make AI output look equivalent to an approved clinician decision.

---

# 21. Alerts

Define severity clearly.

Use:

```text
Info     → Blue
Success  → Green
Warning  → Amber
Critical → Coral
```

Include:

- Icon
- Title
- Explanation
- Action where relevant

---

# 22. Light / Dark Mode

Implement full light/dark support.

Requirements:

- Theme switcher
- System preference detection
- Persistent user preference
- No flash on page load
- Correct chart colors
- Correct logo variation
- Correct modal colors
- Correct table colors
- Correct input colors
- Correct empty states

---

# 23. Multilingual Support

Support:

- English
- Arabic

Do not hardcode visible text.

Use translation files.

---

# 24. RTL Support

Arabic must use complete RTL behavior.

Set:

```html
<html lang="ar" dir="rtl">
```

Use logical CSS:

```css
margin-inline
padding-inline
inset-inline
text-align: start
```

Correctly mirror:

- Sidebar
- Breadcrumbs
- Directional icons
- Dropdowns
- Pagination
- Navigation arrows

Do not mirror universal icons such as:

- Search
- Calendar
- Phone
- Medical symbols

---

# 25. Responsive Design

Test at:

```text
320px
375px
430px
768px
1024px
1280px
1440px
1920px
```

Ensure:

- No horizontal overflow
- Proper mobile navigation
- Responsive tables
- Responsive modals
- Large touch targets
- Forms stack correctly
- Cards adapt naturally

---

# 26. Accessibility

Follow WCAG 2.1 AA principles.

Check:

- Contrast
- Keyboard navigation
- Focus states
- Semantic HTML
- Labels
- Dialog focus
- Screen-reader text
- Reduced motion
- Zoom
- Touch target sizes

Do not rely on color alone.

---

# 27. Motion

Use subtle animation.

Allowed:

- Fade
- Slide
- Small scale
- Skeleton loading
- Menu transitions

Avoid:

- Large bouncing
- Constant movement
- Excessive parallax
- distracting glow

Respect:

```css
prefers-reduced-motion
```

---

# 28. Iconography

Use one icon library consistently.

Icons should:

- Have consistent stroke width
- Use consistent sizes
- Avoid decorative complexity

Recommended sizes:

```text
16px
18px
20px
24px
```

---

# 29. Logo Usage

Create variants:

- Full VIARA logo
- Icon only
- Horizontal logo
- Light-background version
- Dark-background version
- Monochrome version

Use green as dominant brand color.

Amber and coral should appear primarily in the symbol.

Do not distort or recolor the logo inconsistently.

---

# 30. Brand Usage Rule

The core UI should visually follow:

```text
70% Neutral
20% Emerald
7% Amber
3% Coral
```

This is a visual guideline, not an exact mathematical rule.

The interface should never look like a traffic-light system.

---

# 31. Component Refactor

Audit and standardize:

- Buttons
- Cards
- Inputs
- Selects
- Tabs
- Tables
- Modals
- Drawers
- Tooltips
- Toasts
- Alerts
- Badges
- Pagination
- Breadcrumbs
- Navigation
- Skeletons
- Empty states
- Error states

Create reusable components instead of page-specific copies.

---

# 32. Preserve Functionality

Do not break:

- Authentication
- Authorization
- Routes
- APIs
- Data loading
- Forms
- Search
- Filters
- Pagination
- PACS integration
- DICOM workflows
- AI functionality
- Billing
- Reporting
- Portal
- Notifications
- Uploads
- Downloads

Never replace live data with hardcoded examples.

---

# 33. Clean Up Old Branding

Search the entire repository for:

```text
VIARA
VIARA
old brand colors
old logos
hardcoded hex values
old favicons
old metadata
old page titles
```

Replace brand references appropriately with VIARA.

Do not replace database identifiers or technical keys blindly.

Only rename technical identifiers if it is safe and necessary.

---

# 34. Create Centralized Theme Files

Prefer a structure such as:

```text
src/
  design-system/
    tokens.css
    colors.css
    typography.css
    spacing.css
    themes.css
    components/
```

Or adapt to the existing project architecture.

Do not create duplicate theme systems.

---

# 35. Quality Verification

After implementation:

Run:

- Lint
- Type check
- Unit tests
- Integration tests
- Build

Then inspect every major page in:

```text
English Light
English Dark
Arabic Light
Arabic Dark
Desktop
Tablet
Mobile
```

---

# 36. Visual QA

Check:

- Alignment
- Overflow
- Clipping
- Typography
- Contrast
- Spacing
- Logo consistency
- Button hierarchy
- Forms
- Tables
- Dialogs
- Alerts
- Loading states
- Empty states
- Error states

Fix all identified inconsistencies.

---

# 37. Final Deliverables

Provide:

1. Summary of VIARA design implementation
2. Design token documentation
3. Updated color palette
4. Light theme specification
5. Dark theme specification
6. PACS clinical theme specification
7. Typography system
8. Component inventory
9. Modified files
10. Screenshots of key pages
11. RTL/LTR verification summary
12. Mobile/responsive verification summary
13. Accessibility findings
14. Build/test results
15. Remaining design debt

---

# Final Instruction

Do not simply recolor the existing application.

Rebuild the visual system around the VIARA identity while preserving all current workflows and functionality.

The final result should feel like one coherent enterprise healthcare platform across:

- RIS
- PACS
- Viewer
- Portal
- AI
- Reporting
- Billing
- Analytics
- Administration

The interface should feel:

**Modern  
Calm  
Clinical  
Trustworthy  
Intelligent  
Connected  
Human-centered**

The final visual identity must consistently reinforce:

**VIARA — A Better Way to Care.**