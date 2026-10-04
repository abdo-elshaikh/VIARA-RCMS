# Public Portal Builder

The staff settings page at `/settings?tab=portalBuilder` manages the public portal. Access requires the existing Admin role and `MANAGE_SETTINGS`; the existing Developer bypass applies on the server.

## Deployment

Run the normal database migration command before deploying the updated API:

```sh
npm run migrate --prefix backend
npm run build --prefix frontend
npm run build --prefix portal
```

Migration `184_portal_builder.sql` is registered in `database/migrate.js`. It adds a singleton draft, immutable published snapshots, and expiring preview sessions. Opening the builder imports the existing public homepage configuration without publishing changes. Until the first publication, the public endpoint projects the legacy configuration into the supported content contract.

## Editing and publication

- Four layouts: clinical, modern, professional, minimal.
- Shared bilingual content with optional patient/doctor overrides for template, hero, section ordering/visibility/copy, layout, header links, and footer.
- Complete templates: a clinical stack, a modern responsive grid, a professional account-entry layout, and a minimal narrow column. All preserve the configured component order and hide disabled or empty components.
- Layout controls cover page width, spacing, hero height, card presentation, and floating/full-width navigation. Choosing a template applies its layout preset while preserving edited component copy.
- Header links support section anchors, root-relative paths, and HTTPS destinations. Footer controls cover localized text, service links, patient links, and contact details.
- The editor includes template diagrams and a component-order schematic; the separate Preview action renders the actual saved draft.
- Sections can be reordered with accessible up/down controls.
- FAQ and approved testimonials are shared across audiences.
- The portal inherits center branding unless a portal color is set.
- Saving changes only the draft. Publishing creates a snapshot and changes the public pointer atomically.
- Every write checks the submitted revision under a database row lock. Conflicting edits return HTTP 409.
- Restoring a previous version changes the draft only; publication remains explicit.
- Portal queries refresh every 60 seconds while the landing page is open. Public responses use `Cache-Control: no-store`.

## Preview

The Preview action saves pending edits and creates a ten-minute snapshot. A newer preview from the same administrator revokes the previous one. The token is stored hashed in PostgreSQL and sent by the portal through `X-Portal-Preview`. Its initial URL location is the fragment, not the query string, and the portal retains it only in memory when section navigation changes the fragment.

Preview opens in a separate tab and uses the actual portal renderer. Existing nginx `frame-ancestors 'none'` and `X-Frame-Options: DENY` remain in force. Invalid/expired preview credentials fail closed. Preview pages carry `noindex, nofollow`. Sections without backing data show administrative explanations in preview.

## API

| Method | Path under `/api/settings` | Payload |
| --- | --- | --- |
| GET | `/portal` | — |
| PUT | `/portal/draft` | `{ revision, page }` |
| POST | `/portal/publish` | `{ revision }` |
| POST | `/portal/preview-session` | `{ revision }` |
| GET | `/portal/versions` | —; latest 50 entries |
| POST | `/portal/restore` | `{ revision, versionId }` |
| GET | `/public/home` | Published public projection; optional preview header |

Schema validation is strict, limits content lengths/counts and disallows executable URL schemes. URLs accept root-relative paths and HTTPS. Remote images require HTTPS; browser CSP permits them. Text renders through React without arbitrary HTML. Audience selection affects presentation only and does not change account authorization.

## Scope and validation

The builder changes the public landing page and account entry points. It does not edit authenticated dashboards, add referral functionality, upload media, or import arbitrary templates. Templates and defaults are code-defined. SEO fields update client metadata; reliable crawler/social-card rendering may require a separate prerender/server-rendering change.

Focused checks:

```sh
npm test --prefix backend -- --runInBand portal-builder.test.js portal-builder-lifecycle.test.js portal-builder-access.test.js
npm run test:ci --prefix frontend -- src/components/settings/__tests__/PortalBuilderSettings.test.jsx src/pages/__tests__/Settings.test.jsx src/config/__tests__/settingsSections.test.js src/i18n/__tests__/settingsLocales.test.js
npm test --prefix portal
npm run typecheck --prefix portal
npm run check:locales
```

The local migration checksum drift is resolved: historical `083_payroll_deductions_penalties.sql` was restored byte-for-byte to its recorded checksum. Its fresh-install correction is preserved in migration `186_fresh_payroll_default_rule.sql`, registered immediately after 083 and before the positive-rate constraint in 117. It removes only the exact zero-rate default placeholder on installations where 117 has not yet been applied; existing payroll installations and custom rules are untouched. Applied checksum records were not overwritten.

Migrations 186, 184 and the existing pending 185 were applied successfully using the normal migration runner. Migration 186's fresh/existing-install guards were validated on PostgreSQL in a rolled-back isolated schema. A separate PostgreSQL lifecycle validation exercised real draft saving, audit persistence, publication, preview access and restoration; the surrounding transaction rolled back the validation schema and audit entries. The public page retains its legacy projection until an administrator explicitly publishes a draft.
