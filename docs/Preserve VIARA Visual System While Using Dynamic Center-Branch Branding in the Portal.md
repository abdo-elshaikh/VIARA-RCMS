# AI Agent Prompt — Preserve VIARA Visual System While Using Dynamic Center/Branch Branding in the Portal

Act as a senior healthcare product designer, frontend architect, UX engineer, and design-system specialist.

Review and refactor the entire Patient / Referring Physician Portal.

The portal must preserve the **VIARA design language, UX architecture, component system, accessibility standards, responsiveness, Light/Dark Mode, RTL/LTR behavior, and overall visual quality**, while dynamically displaying the correct **Radiology Center and Branch identity** from system settings.

The fundamental rule is:

> **VIARA defines how the portal looks and behaves.  
> Center/Branch Settings define who the portal represents.**

Do not confuse platform identity with healthcare-provider identity.

---

# 1. Architecture Principle

Maintain three clearly separated layers:

```text
VIARA Platform
      │
      ├── Design System
      ├── Components
      ├── UX patterns
      ├── Typography
      ├── Accessibility
      ├── Responsive behavior
      └── Light / Dark architecture

Radiology Center
      │
      ├── Center Name
      ├── Center Logo
      ├── Branding
      ├── Contacts
      ├── Website
      └── General identity

Branch
      │
      ├── Branch Name
      ├── Address
      ├── Phone
      ├── WhatsApp
      ├── Email
      ├── Working Hours
      └── Location
```

The portal must combine these layers without duplicating or hard-coding branding.

---

# 2. Preserve VIARA Visual Identity

Do NOT redesign the portal independently for every center.

The following should remain controlled by the VIARA Design System:

- Layout structure
- Grid
- Spacing
- Typography hierarchy
- Border radius
- Shadows
- Buttons
- Inputs
- Cards
- Tables
- Dialogs
- Drawers
- Tabs
- Navigation behavior
- Loading states
- Empty states
- Error states
- Animation
- Accessibility
- Responsive behavior
- RTL/LTR architecture
- Light/Dark Mode architecture

The portal should always feel like a polished VIARA-powered healthcare product.

---

# 3. VIARA Base Design Tokens

Preserve the current VIARA visual system.

Primary:

```css
--viara-primary: #087F5B;
--viara-primary-hover: #066A4C;
--viara-primary-dark: #064E3B;
--viara-primary-light: #DDF4EA;
```

Accent:

```css
--viara-amber: #F4B942;
--viara-coral: #D95757;
```

Neutral Light:

```css
--background: #F7FAF9;
--surface: #FFFFFF;
--surface-secondary: #F0F5F3;
--border: #DCE7E3;

--text-primary: #172326;
--text-secondary: #5F6F6B;
--text-muted: #8B9995;
```

Dark:

```css
--background: #091310;
--surface: #101D19;
--surface-secondary: #172722;
--border: #294039;

--text-primary: #F3F8F6;
--text-secondary: #B6C5C0;
--text-muted: #82948E;
```

Do not scatter these values across portal components.

Use centralized tokens.

---

# 4. Dynamic Center Identity

The portal must dynamically obtain center identity from the configured Center Settings.

Support:

```text
Center Name
Center Name Arabic

Center Logo
Light Logo
Dark Logo

Center Primary Brand Color
Optional Secondary Brand Color

Phone
Hotline
WhatsApp
Email
Support Email
Website

Main Address
Arabic Address

Social Links

Portal Welcome Message
Arabic Welcome Message

Footer Text
Arabic Footer Text
```

Never hard-code a center name, logo, phone number, address, or contact information in portal components.

---

# 5. Dynamic Branch Identity

For branch-specific content dynamically obtain:

```text
Branch ID
Branch Name
Branch Name Arabic

Branch Logo Override
if configured

Address
Arabic Address

Phone
Hotline
WhatsApp
Email

Working Hours

Google Maps / Location

Branch-specific portal information
```

Use branch overrides where configured.

Otherwise inherit from Center Settings.

---

# 6. Identity Resolution

Create ONE centralized portal identity resolver.

For example:

```ts
resolvePortalIdentity({
  centerId,
  branchId,
  language,
  theme
})
```

Do not implement fallback logic independently in Header, Footer, Contact Card, Appointment Card, etc.

Recommended resolution:

```text
Requested branch
       ↓
Branch-specific setting
       ↓
Center setting
       ↓
VIARA safe fallback
```

Example:

```text
Branch Logo
↓
Center Logo
↓
VIARA fallback asset
```

Same principle for:

```text
Phone
Email
Address
Website
Brand Color
Footer
```

---

# 7. Important Branding Rule

Do NOT replace the entire VIARA palette with arbitrary center colors.

This can destroy:

- Accessibility
- Contrast
- Semantic status colors
- Dark Mode
- Clinical consistency
- UX hierarchy

Instead implement controlled white-label branding.

Center branding may influence:

```text
Logo
Primary CTA
Selected navigation
Links
Small decorative accents
Hero accent
Focus accents where contrast allows
```

VIARA continues controlling:

```text
Backgrounds
Surfaces
Typography
Spacing
Cards
Borders
Semantic colors
Critical states
Warning states
Success states
Layout
Component architecture
```

---

# 8. Dynamic Brand Tokens

Map center settings into semantic portal tokens.

Example:

```css
--portal-brand: var(--center-primary, #087F5B);
--portal-brand-hover: ...;
--portal-brand-soft: ...;
--portal-brand-contrast: ...;
```

Never directly use:

```tsx
style={{ color: center.primaryColor }}
```

throughout the application.

All dynamic colors must pass through the theme/token layer.

---

# 9. Validate Center Colors

Administrators may configure poor colors.

Therefore validate center branding before applying it.

Check:

- Valid color format
- Contrast
- Readability
- Light Mode compatibility
- Dark Mode compatibility
- Button text contrast

If the configured color is unsafe, automatically fall back to VIARA Emerald.

Example:

```text
Invalid color
→ VIARA default

Insufficient button contrast
→ calculate safe foreground

Unsafe Dark Mode color
→ generate/adapt accessible dark variant
```

Do not allow configuration to make the portal unusable.

---

# 10. Semantic Colors Must Never Be Rebranded

These meanings remain controlled by VIARA:

```text
Success  → Green
Warning  → Amber
Critical → Coral / Red
Info     → Blue/Teal
```

A center's brand color must NEVER override:

- Critical results
- Emergency states
- Errors
- Warnings
- Success indicators

Clinical semantics always take priority over branding.

---

# 11. Portal Header

Redesign/use the shared Portal Header.

Display:

```text
[Center Logo]

Center Name
optional Branch Name

Navigation

Language
Theme
Notifications
Patient/User menu
```

Do NOT show the VIARA wordmark as the main organization logo when a Center Logo exists.

VIARA may appear subtly elsewhere as platform attribution.

---

# 12. Center Logo Behavior

Resolve:

```text
Light Mode
→ center.logoLight
→ center.logo
→ VIARA fallback

Dark Mode
→ center.logoDark
→ center.logoLight
→ center.logo
→ VIARA fallback
```

Use:

```css
object-fit: contain;
```

Never:

- Stretch
- Crop
- Distort
- Force arbitrary aspect ratios

Define maximum width/height.

---

# 13. Portal Hero

The hero should feel personalized to the healthcare provider.

Example:

```text
Welcome to

[Center Name]

Your medical imaging and reports,
securely available when you need them.
```

Arabic equivalent must come from translations/settings.

Allow optional:

```text
Center Welcome Message
Branch Welcome Message
```

But maintain VIARA typography and layout.

---

# 14. Branch Display

When the portal is operating in a specific branch context, show:

```text
Center Name
Branch Name
Address
Contact
Working Hours
```

appropriately.

Do not unnecessarily repeat the branch everywhere.

Use branch context where relevant.

---

# 15. Multi-Branch Patient Behavior

A patient may have records from multiple branches.

The global portal shell should generally represent:

```text
Center / Organization
```

Individual records should represent:

```text
Originating Branch
```

Example:

```text
MRI Brain
Nasr City Branch

CT Chest
Heliopolis Branch

X-Ray Knee
Maadi Branch
```

Do NOT switch the entire portal branding every time a patient views a study from another branch.

---

# 16. Appointment Cards

Appointment cards should dynamically show:

```text
Procedure
Date
Time

Center
Branch

Branch Address
Phone

Directions
```

Use branch data associated with the appointment.

---

# 17. Study / Result Cards

Display:

```text
Study Name
Modality
Study Date
Status
Branch
Radiologist where appropriate
```

The branch must come from the study/order data.

Do not use the user's currently selected branch if the study originated elsewhere.

---

# 18. Reports

When reports are viewed or downloaded from the portal:

Use the report's originating:

```text
Center
Branch
Logo
Address
Contacts
```

not merely the current portal shell identity.

Preserve finalized document snapshots where available.

---

# 19. Portal Footer

The footer should dynamically use Center Settings.

Example structure:

```text
[Center Logo]

Center Name

Address
Hotline
Phone
WhatsApp
Email

Quick Links
Privacy
Terms
Contact
```

At the bottom, optionally display:

```text
Powered by VIARA
```

Keep this subtle.

Do not make VIARA visually compete with the healthcare provider.

---

# 20. Powered by VIARA

VIARA is the technology platform.

Use subtle attribution such as:

```text
Powered by VIARA
```

Recommended locations:

- Footer bottom
- Login footer
- About/help section

Do NOT place a large VIARA logo beside the center logo.

The healthcare provider remains the primary patient-facing brand.

---

# 21. Login Screen

The login screen should combine both identities elegantly.

Primary identity:

```text
Center Logo
Center Name
```

Supporting platform attribution:

```text
Powered by VIARA
```

Maintain VIARA layout, typography, forms, validation, security UX, and responsive behavior.

---

# 22. Contact Section

Create a reusable:

```tsx
<CenterContactCard />
```

or equivalent.

Dynamically support:

```text
Hotline
Phone
WhatsApp
Email
Address
Directions
Working Hours
```

Hide missing fields cleanly.

Never render:

```text
Phone: undefined
Email: null
```

---

# 23. Maps

If configured, use the branch location for:

```text
Get Directions
View on Map
```

Never hard-code coordinates.

---

# 24. Arabic / English

Support full localization.

English:

```text
Center Name
Branch Name
Address
Welcome Message
Footer
```

Arabic:

```text
Center Arabic Name
Branch Arabic Name
Arabic Address
Arabic Welcome Message
Arabic Footer
```

Fallback:

```text
Arabic value
↓
English value
↓
safe default
```

Do not duplicate translation logic across components.

---

# 25. RTL

Arabic portal must correctly support:

```html
dir="rtl"
lang="ar"
```

Use logical CSS properties.

Correctly mirror:

- Navigation
- Breadcrumbs
- Direction arrows
- Drawers
- Pagination
- Layout alignment

Do not blindly mirror medical or universal icons.

---

# 26. Light / Dark Mode

Both themes must work with dynamic Center Branding.

Test:

```text
Center Logo + Light
Center Logo + Dark

Center Color + Light
Center Color + Dark
```

If no dark logo exists, provide a safe logo container rather than making the logo invisible.

---

# 27. Portal Settings

Use existing Center/Branch Settings.

Do NOT create a second duplicate portal-branding database unless genuinely required.

Portal configuration should consume existing settings such as:

```text
Organization
Branding
Contacts
Branches
```

Portal-specific settings may include only:

```text
Portal Enabled
Portal Welcome Message
Portal Footer
Show WhatsApp
Show Address
Show Working Hours
Show Powered by VIARA
```

---

# 28. Branding Preview

Inside Center Settings, provide:

```text
Portal Preview
```

Preview at minimum:

```text
Desktop Light
Desktop Dark
Mobile Light
Mobile Dark
```

The administrator should be able to verify:

```text
Logo
Center Name
Brand Color
Contacts
Footer
```

before publishing.

---

# 29. Logo Upload Requirements

Support safe logo formats such as:

```text
PNG
JPEG
WebP
SVG if safely sanitized
```

Prefer transparent PNG/SVG for branding.

Provide:

```text
Main Logo
Light Logo
Dark Logo
Square/Icon Logo
```

Use the square logo for:

```text
Favicon
PWA
Mobile shortcut
```

where appropriate.

---

# 30. VIARA Fallback Assets

Keep the approved VIARA assets in the project as safe defaults:

```text
VIARA Primary Logo
VIARA Light Logo
VIARA Dark Logo
VIARA Symbol
VIARA Favicon
```

But use them only when center branding is unavailable or when platform attribution is intended.

---

# 31. Favicon Strategy

Prefer:

```text
Center favicon
↓
Center square logo
↓
VIARA favicon
```

This allows white-label portals to appear correctly in browser tabs and installed PWAs.

---

# 32. Metadata

Dynamically generate portal metadata.

Example:

```text
<title>
Patient Portal | {Center Name}
</title>
```

Also update where supported:

```text
Favicon
PWA name
Theme color
Open Graph image
Description
```

Do not hard-code:

```text
VIARA Patient Portal
```

when the portal represents another healthcare provider.

---

# 33. Responsive Requirements

Preserve VIARA responsive architecture.

Verify:

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

Dynamic center names and logos must not break layouts.

Test very long:

```text
Center Names
Branch Names
Arabic Names
Addresses
```

Use truncation/wrapping appropriately.

---

# 34. Accessibility

Center customization must never break accessibility.

Maintain:

- WCAG AA contrast
- Keyboard navigation
- Visible focus
- Screen-reader labels
- Semantic structure
- Touch targets
- Reduced motion

Automatically reject or normalize unsafe branding colors where necessary.

---

# 35. Performance

Do not repeatedly request Center Settings from every component.

Use centralized:

```text
PortalIdentityProvider
```

or equivalent.

Example:

```tsx
<PortalIdentityProvider>
  <Portal />
</PortalIdentityProvider>
```

Expose normalized data through a hook/service:

```ts
const {
  center,
  branch,
  branding,
  contacts
} = usePortalIdentity();
```

Cache safely.

Invalidate when settings change.

---

# 36. Loading Behavior

Do not show incorrect VIARA branding briefly before center settings load.

Provide a neutral loading shell or server-resolved identity.

Avoid:

```text
VIARA Logo
→ loading
→ suddenly Center Logo
```

This creates visible brand flashing.

---

# 37. Error / Missing Settings

The portal must remain functional if settings are incomplete.

Example fallback:

```text
Missing Logo
→ neutral center initials or VIARA fallback

Missing Branch Phone
→ Center Phone

Missing Branch Address
→ Center Address

Missing Center Brand Color
→ VIARA Emerald
```

Never crash the portal because optional branding information is missing.

---

# 38. Security

Treat Center Settings as server-controlled configuration.

Do not trust arbitrary HTML entered into:

```text
Welcome Message
Footer
Contact fields
```

Sanitize or render as plain text unless controlled rich-text support already exists.

Prevent script injection through:

```text
SVG
HTML
URLs
Social Links
```

---

# 39. Portal Surfaces to Audit

Review ALL portal routes and components, including:

```text
Landing
Login
Registration
Forgot Password
Patient Dashboard
Doctor Dashboard
Appointments
Studies
Reports
Results
Downloads
Profile
Contact
Help
Notifications
Footer
Header
Error Pages
404
Maintenance
Mobile Navigation
```

Identify every hard-coded:

```text
VIARA
VIARA
Center Name
Logo
Phone
Address
Email
Website
Color
```

Classify each occurrence before replacing it.

---

# 40. Do Not Blindly Remove VIARA

Distinguish:

```text
VIARA as platform identity
```

from:

```text
VIARA incorrectly hard-coded as healthcare provider
```

Keep VIARA where the software/platform is being referenced.

Replace it with Center Settings where the healthcare provider should be represented.

---

# 41. Desired Result

The final portal architecture should be:

```text
                 VIARA
             Design System
                  │
       ┌──────────┼──────────┐
       │          │          │
      UX      Components   Themes
       │          │          │
       └──────────┼──────────┘
                  │
          Portal Experience
                  │
          Dynamic Identity
                  │
       ┌──────────┴──────────┐
       │                     │
 Center Settings       Branch Settings
       │                     │
       └──────────┬──────────┘
                  │
           Patient / Doctor
                Portal
```

Conceptually:

> **VIARA provides the experience.  
> The healthcare center owns the identity.**

---

# 42. Required QA Matrix

Test at least:

```text
Center A / Branch 1
Center A / Branch 2
Center B / Branch 1

English / Arabic
LTR / RTL

Light / Dark

Desktop / Tablet / Mobile
```

Also test:

```text
Center with complete branding
Center without logo
Center without custom colors
Branch with overrides
Branch without overrides
Very long Arabic center name
Very long English center name
Missing contacts
Invalid brand color
```

---

# 43. Final Deliverables

After implementation provide a report containing:

1. Portal identity architecture
2. Center settings consumed
3. Branch settings consumed
4. VIARA tokens preserved
5. Dynamic tokens introduced
6. Identity resolver implementation
7. Logo fallback strategy
8. Color accessibility strategy
9. Light/Dark verification
10. Arabic/English verification
11. RTL/LTR verification
12. Responsive verification
13. All portal routes reviewed
14. Hard-coded branding removed
15. Remaining hard-coded values
16. Screenshots of major portal pages
17. Build results
18. Test results
19. Any migration required
20. Remaining technical/design debt

---

# Critical Acceptance Criteria

Do not consider the work complete unless all of the following are true:

- The VIARA visual design system remains consistent.
- Portal components are not redesigned independently per center.
- Center logo and name come from Center Settings.
- Branch information comes from the relevant Branch Settings.
- Contact information is never hard-coded.
- Light and Dark Mode remain correct.
- Arabic and English remain correct.
- RTL and LTR remain correct.
- Dynamic branding passes accessibility requirements.
- Semantic clinical colors cannot be overridden by center branding.
- Multi-branch studies retain their correct originating branch.
- VIARA is presented as the software platform, not incorrectly as the healthcare provider.
- No duplicate branding logic exists across portal components.
- Existing portal functionality, routes, APIs, authentication, permissions, downloads, reports, and workflows remain fully operational.

Final principle:

**VIARA = Product Experience & Design System**

**Center Settings = Healthcare Provider Identity**

**Branch Settings = Location-Specific Identity & Contact Information**

Build the portal around this separation and preserve it throughout the codebase.