# VIARA Healthcare Technology

Bilingual Arabic/English marketing site and authenticated content management system.

## Public experience

- Arabic `/` and English `/en`, including translated forms, FAQs and request pages.
- Systems, configurable packages, active offers, a solution finder and a workflow tour.
- Scroll reveals, floating accents, interactive demo chart and reduced-motion support.
- Approved customer reviews, with consent and moderation for new submissions.
- Contact channels, social links and WhatsApp rendered only when configured.
- D1-backed inquiries, request status tracking, per-user downloads and deletion.

## Administration

`/admin` requires platform sign-in plus an exact server-side match against the
verified owner email in the secret runtime variable `VIARA_ADMIN_EMAIL`. Missing
configuration fails closed. No admin credential is included in the client bundle.

The admin can edit bilingual content, product features, package names and pricing,
offers and expiry dates, FAQs, brand color, logo, contact information and SEO
metadata. Uploaded PNG/JPEG/WebP logos (up to 3 MB) are stored in the `BUCKET` R2
binding. Structured data is stored in D1 under `DB`.

Content uses optimistic revision checks to reject stale saves. Save & publish makes
content changes visible on subsequent page loads. Review moderation and customer
request statuses update immediately. Offers expire at the end of the specified
Africa/Cairo calendar day.

The inbox displays the latest 200 requests with search, filtering and CSV export.
The personal request pages display only records for the authenticated site user.
The site preserves its current owner-private audience.

## Verification

- `node node_modules/typescript/bin/tsc --noEmit`
- `node --experimental-strip-types --test tests/inquiry.test.mjs tests/content.test.mjs`
- `python tests/migrations_test.py`
- Build with the Sites plugin `build-site.mjs` helper.

Append migrations using Drizzle; do not modify applied migration history.

## Content

No customer reviews, business contact details, prices or special offers are
fabricated. Configure real information in the admin. Interface examples use sample
data and are marked illustrative. Forms store records; there is no automated
outbound email or WhatsApp notification integration.
