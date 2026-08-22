# AI Agent Prompt — Centralize Radiology Center & Branch Settings Across the Entire System

Act as a senior software architect and full-stack engineer.

Review the complete application and implement a centralized **Radiology Center / Branch Identity & Settings System**.

The objective is to ensure that all reports, invoices, receipts, stickers, labels, printouts, patient/referring-doctor portals, emails, exported PDFs, and other generated documents dynamically use the correct radiology center and branch information instead of hard-coded values.

Preserve all existing workflows, APIs, business logic, permissions, print functionality, and existing data.

---

# 1. Core Requirement

Create or improve a single authoritative source for:

**Radiology Center Settings**

and

**Branch Settings**

Every document or UI surface that represents the healthcare organization must dynamically load its information from these settings.

Never hard-code:

- Center name
- Branch name
- Logo
- Address
- Phone
- Hotline
- Email
- Website
- Tax information
- Registration information
- Social links
- Footer text
- Branding colors
- Contact details

---

# 2. Data Hierarchy

Use this hierarchy:

```text
Organization / Radiology Center
        │
        ├── Global Settings
        │
        ├── Branding
        │
        └── Contact / Legal Information
        │
        └── Branches
              │
              ├── Branch A
              ├── Branch B
              ├── Branch C
              └── ...
```

A branch may override organization-level values.

Example resolution:

```text
Branch Logo
↓
if missing
Center Logo
↓
if missing
VIARA default logo
```

Apply the same fallback behavior to relevant fields.

---

# 3. Center Settings

Support at minimum:

```text
Center ID
Center Name
Center Name Arabic
Legal Name
Legal Name Arabic

Logo
Logo Dark
Logo Light
Favicon

Primary Color
Secondary Color
Accent Color

Phone
Alternative Phone
Hotline
WhatsApp

Email
Support Email

Website

Main Address
Main Address Arabic

Country
Governorate / State
City
Postal Code

Tax Registration Number
Commercial Registration Number
Medical License Number

Footer Text
Footer Text Arabic

Report Disclaimer
Report Disclaimer Arabic

Invoice Footer
Invoice Footer Arabic

Receipt Footer
Receipt Footer Arabic

Portal Welcome Message
Portal Welcome Message Arabic

Social Media Links

Default Language
Timezone
Currency

VAT / Tax Settings
```

---

# 4. Branch Settings

Every branch should support:

```text
Branch ID
Branch Code

Branch Name
Branch Name Arabic

Branch Display Name
Branch Display Name Arabic

Branch Logo Override

Phone
Alternative Phone
Hotline
WhatsApp

Email

Address
Address Arabic

Google Maps / Location URL

Country
Governorate
City
Postal Code

Tax Number Override
Commercial Registration Override

Medical License

Working Hours

Report Header Override
Report Footer Override

Invoice Header Override
Invoice Footer Override

Receipt Footer Override

Sticker Footer Override

Portal Contact Information

Active / Inactive Status
```

Do not duplicate organization settings unnecessarily.

Allow inheritance from the parent center.

---

# 5. Create a Central Settings Resolver

Do NOT fetch settings independently in every component.

Create a centralized service such as:

```text
CenterIdentityService
BranchIdentityService
BrandingService
DocumentIdentityService
```

or equivalent matching the existing architecture.

It should return normalized information such as:

```ts
interface BranchIdentity {
  centerId: string;
  branchId: string;

  centerName: string;
  centerNameAr?: string;

  branchName: string;
  branchNameAr?: string;

  displayName: string;
  displayNameAr?: string;

  logoUrl?: string;
  logoDarkUrl?: string;
  logoLightUrl?: string;

  address?: string;
  addressAr?: string;

  phone?: string;
  hotline?: string;
  whatsapp?: string;

  email?: string;
  website?: string;

  taxNumber?: string;
  commercialRegistration?: string;
  medicalLicense?: string;

  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;

  footer?: string;
  footerAr?: string;
}
```

Resolve branch-specific values first and organization values second.

---

# 6. Branch Context

Determine the correct branch from the business entity, not merely from the current logged-in user.

For example:

```text
Study
→ order
→ visit
→ branch
→ BranchIdentity
```

For financial documents:

```text
Invoice
→ invoice.branch_id
→ BranchIdentity
```

For receipt:

```text
Payment
→ invoice
→ branch
→ BranchIdentity
```

This is important.

A user from Branch A printing an old invoice created at Branch B must see **Branch B's identity**, not Branch A's current settings.

---

# 7. Reports

Update every radiology report.

Report header should dynamically support:

```text
Logo

Center Name
Branch Name

Branch Address

Phone / Hotline
Email
Website

Medical / License Information
```

Then patient/report information.

Example:

```text
[LOGO]

VIARA Radiology Center
Nasr City Branch

15 Example Street, Cairo
Hotline: 19XXX
Phone: +20 ...
www.example.com

---------------------------------

Patient
Study
Report
...
```

Footer may contain:

```text
Branch contact details
Center website
Medical license
Report disclaimer
Page X / Y
```

Support English and Arabic.

---

# 8. Report Signing

Keep organization branding separate from physician information.

Example:

```text
CENTER / BRANCH HEADER

REPORT CONTENT

Radiologist:
Dr. Ahmed Example
Consultant Radiologist

Digital Signature
```

Do not incorrectly store physician information in branch settings.

---

# 9. Invoices

Every invoice must resolve its branch identity from the invoice itself.

Header:

```text
Logo

Center Name
Branch Name

Address
Phone
Email
Website

Tax Registration
Commercial Registration
```

Invoice information:

```text
Invoice Number
Date
Patient
Services
Subtotal
Discount
Tax
Total
Paid
Balance
```

Footer:

```text
Thank you
Branch contacts
Tax information
Custom invoice footer
```

---

# 10. Receipts

Receipt should include:

```text
Logo
Center
Branch

Address
Phone / Hotline

Receipt Number
Date / Time

Patient
Invoice Reference
Payment Method
Amount Paid
Remaining Balance

Cashier

Thank-you message

Branch-specific receipt footer
```

Make thermal-printer layouts compact.

Support:

```text
58mm
80mm
A4
```

where relevant.

---

# 11. Patient Stickers / Labels

Update all stickers.

Depending on available size, dynamically include:

```text
Logo / abbreviated logo

Center Name
Branch Name

Patient Name
Patient ID
Age / DOB
Gender

Accession Number
Study
Modality
Date
```

Optional:

```text
Branch Phone
Barcode
QR Code
```

Do not overcrowd small labels.

Logo and center identity should automatically scale for each label format.

---

# 12. DICOM / Modality Labels

Review any DICOM or modality-generated labels.

Ensure the correct:

```text
Institution Name
Institution Address
Station / Branch
Accession
Patient identifiers
```

are mapped appropriately.

Do not modify DICOM identifiers blindly.

Follow existing DICOM workflows.

---

# 13. Portal

The patient and referring-doctor portal must dynamically display the correct center/branch identity.

Update:

```text
Header
Footer
Login screen
Contact section
Appointment details
Result page
Report page
Study page
Download pages
Support information
```

Example:

```text
VIARA

[Center Name]
[Branch Name]

Need help?
Hotline
Phone
WhatsApp
Email
Address
```

Portal branding should use center-specific identity where configured.

---

# 14. Multi-Branch Portal Behavior

If a patient has studies from multiple branches:

Do NOT globally switch the entire portal to the last study's branch.

Global portal shell should normally use:

```text
Organization identity
```

Individual studies/orders should show:

```text
Study branch identity
```

Example:

```text
MRI Brain
Nasr City Branch
```

and:

```text
CT Chest
Heliopolis Branch
```

---

# 15. PDFs

Audit every PDF-generation location.

Examples:

```text
Radiology reports
Invoices
Receipts
Statements
Medical certificates
Patient documents
Insurance documents
Financial reports
Doctor reports
Exported reports
```

Replace hard-coded branding with `DocumentIdentity`.

Ensure PDFs support:

```text
Logo
Arabic
English
RTL
LTR
Correct fonts
Page headers
Page footers
Page numbering
```

---

# 16. Print Templates

Centralize shared print building blocks.

Recommended components:

```text
DocumentHeader
DocumentFooter
CenterLogo
CenterIdentity
BranchIdentity
ContactBlock
LegalBlock
PatientBlock
SignatureBlock
```

Example:

```tsx
<DocumentHeader identity={identity} />
```

instead of repeatedly creating different headers.

---

# 17. Emails

Where emails represent the organization, use dynamic:

```text
Center name
Branch name
Logo
Phone
Email
Website
Support information
```

Examples:

```text
Appointment confirmation
Report ready notification
Password reset
Patient invitation
Doctor invitation
Payment confirmation
```

For branch-specific communications, use the originating branch.

---

# 18. SMS / WhatsApp

Where practical:

```text
Your MRI appointment at
{centerName} - {branchName}
is scheduled for...
```

Do not hard-code VIARA or VIARA inside transactional messages where the center's commercial identity should be displayed.

VIARA may remain the platform/provider identity where appropriate.

---

# 19. Separate Platform Brand from Customer Brand

This is critical.

**VIARA is the software platform.**

The healthcare organization using VIARA may be:

```text
Cairo Scan
TechnoScan
ABC Radiology
XYZ Medical Center
etc.
```

Do NOT replace the customer's center identity with VIARA everywhere.

Use:

```text
Customer-facing documents
→ Radiology Center / Branch identity
```

Use VIARA primarily for:

```text
Software login
System administration
About
Platform footer where appropriate
Powered by VIARA
```

Example:

```text
Cairo Scan
Nasr City Branch

[patient report]

Powered by VIARA
```

This architecture allows VIARA to become a commercial multi-center healthcare platform.

---

# 20. White-Label Support

Prepare the architecture for white-labeling.

Allow configuration of:

```text
Center logo
Center colors
Center name
Portal branding
Report branding
Invoice branding
Contact information
Domain
Email sender identity
```

Optional setting:

```text
showPoweredByViara = true / false
```

depending on licensing rules.

---

# 21. Settings UI

Create or improve:

```text
Settings
→ Organization
→ Branding
→ Contact Information
→ Legal Information
→ Branches
```

For each branch:

```text
General
Contacts
Address
Branding
Working Hours
Documents
Portal
Billing
```

Use tabs or clearly organized sections.

---

# 22. Logo Upload

Support:

```text
PNG
JPG/JPEG
SVG where safely supported
WebP
```

Validate:

```text
File type
Magic bytes
File size
Dimensions
```

Provide:

```text
Preview
Replace
Remove
Light logo
Dark logo
```

Do not use arbitrary externally hosted URLs when avoidable.

---

# 23. Branding Preview

Inside settings, provide preview cards for:

```text
Report
Invoice
Receipt
Sticker
Portal
```

This allows administrators to understand how branding changes will appear before saving.

---

# 24. Caching

Because center/branch settings are frequently read:

Implement safe caching where appropriate.

Example:

```text
branchIdentity:{branchId}
```

Invalidate cache whenever branch or center settings change.

Do not allow stale identity information to remain indefinitely.

---

# 25. API Design

Prefer APIs such as:

```text
GET /api/settings/organization
GET /api/branches
GET /api/branches/:id
GET /api/branches/:id/identity
```

Administrative writes:

```text
PUT /api/settings/organization
PUT /api/branches/:id
PUT /api/branches/:id/branding
```

Adapt to the current API architecture rather than creating duplicate endpoints unnecessarily.

---

# 26. Authorization

Settings modifications should require appropriate administrative permission.

Examples:

```text
settings.organization.view
settings.organization.edit

branches.view
branches.edit

branding.edit
```

Normal users may read the resolved branch identity required to render documents, but must not be able to modify it.

---

# 27. Audit Logging

Audit changes to:

```text
Center Name
Branch Name
Logo
Address
Contacts
Tax information
Commercial registration
Medical license
Branding
Invoice information
Document footer
Portal identity
```

Record:

```text
Who changed it
When
Old value
New value
Branch
```

Do not store sensitive binary logo contents directly in audit logs.

---

# 28. Historical Document Integrity

Be careful with historical invoices and reports.

Decide whether documents should display:

### Current identity

or

### Identity captured at creation/finalization

For legally important financial or medical documents, prefer snapshotting relevant identity at finalization where appropriate.

Example:

```text
invoice.brand_snapshot
report.organization_snapshot
```

This prevents an old invoice from changing visually/legalistically after the center changes:

```text
Address
Tax Number
Legal Name
```

At minimum evaluate this requirement and document the chosen behavior.

---

# 29. Recommended Snapshot Model

For finalized documents consider storing:

```json
{
  "centerName": "...",
  "branchName": "...",
  "logoUrl": "...",
  "address": "...",
  "phone": "...",
  "taxNumber": "...",
  "commercialRegistration": "..."
}
```

Do NOT unnecessarily duplicate live settings on every draft document.

Take the snapshot at the appropriate finalization event.

---

# 30. Search Entire Repository

Search for:

```text
VIARA
Radiology Center
center_name
branch_name
logo_url
phone
hotline
address
tax_number
website
email
hard-coded company names
hard-coded logos
hard-coded addresses
hard-coded telephone numbers
```

Identify every instance.

Classify each as:

```text
Platform identity
Center identity
Branch identity
Patient data
Legacy hard-code
```

Replace safely.

---

# 31. Do Not Blindly Rename Technical Identifiers

Do NOT automatically rename:

```text
Database tables
Foreign keys
API contracts
Environment variables
Storage paths
Internal IDs
Migration identifiers
```

only because they contain VIARA.

Separate:

```text
Technical internal identifier
```

from:

```text
User-facing branding
```

Avoid unnecessary breaking migrations.

---

# 32. Tests

Add tests covering:

### Organization fallback

```text
Branch logo missing
→ center logo returned
```

### Branch override

```text
Branch address present
→ branch address returned
```

### Correct historical branch

```text
Invoice from Branch B
printed by user currently in Branch A
→ Branch B appears
```

### Portal

```text
Study belonging to Branch C
→ Branch C shown
```

### Language

```text
Arabic
→ Arabic branch name/address

English
→ English branch name/address
```

### Finalized snapshot

```text
Change center settings
→ finalized historical document remains correct
```

if snapshot behavior is implemented.

---

# 33. Verification Matrix

Verify:

```text
Reports
Invoices
Receipts
Stickers
Labels
Portal
Emails
PDF exports
Financial statements
Patient exports
Referral documents
```

against:

```text
Branch A
Branch B

Arabic
English

Light Mode
Dark Mode

A4
Thermal print
Mobile
Desktop
```

---

# 34. Final Architecture

The desired architecture is:

```text
                 Organization Settings
                          │
              ┌───────────┴───────────┐
              │                       │
         Global Identity          Global Branding
              │
      ┌───────┼────────┐
      │       │        │
   Branch A Branch B Branch C
      │       │        │
      └───────┴────────┘
              │
       Identity Resolver
              │
     ┌────────┼─────────────┬───────────┐
     │        │             │           │
 Reports   Invoices      Stickers     Portal
     │        │             │           │
 Receipts  PDFs          Labels      Emails
```

There must be ONE consistent resolution strategy.

---

# 35. Final Deliverables

After implementation provide:

1. Center/branch settings data model
2. Settings inheritance model
3. Identity resolution logic
4. List of database changes
5. List of APIs created or modified
6. Settings UI changes
7. Reports updated
8. Invoice templates updated
9. Receipt templates updated
10. Sticker templates updated
11. Portal changes
12. PDF changes
13. Email/SMS changes
14. Snapshot strategy
15. Permissions
16. Audit behavior
17. Test results
18. Build results
19. Remaining hard-coded branding, if any
20. Migration/deployment notes

---

# Critical Final Requirement

The system must clearly distinguish:

**VIARA = Software Platform**

from:

**Radiology Center = Customer / Healthcare Provider**

from:

**Branch = Physical or operational location**

Customer-facing clinical and financial documents must primarily represent the healthcare provider and correct originating branch.

The VIARA platform brand may appear subtly as:

**Powered by VIARA**

where appropriate.

Do not make reports, invoices, receipts, stickers, or patient-facing documents display VIARA as the healthcare provider unless VIARA itself is explicitly configured as that provider.

The final implementation must support true multi-center, multi-branch, and white-label operation without duplicating branding logic throughout the codebase.