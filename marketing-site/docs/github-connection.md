# GitHub connection

The VIARA marketing Site source is stored in `abdo-elshaikh/VIARA-RCMS` under
`marketing-site/`, on branch `site/marketing-site`.

- Live Site: https://viara-healthcare.plus-0952.chatgpt.site
- Sites project: `appgprj_6acfb69903c08191b30ab016881c13ee`
- Imported Sites source commit: `99939db6b2ad50294fa3b5b98be243074f1380c9`

## Development and deployment

Work from `marketing-site/` when running the package scripts. This code uses
Node.js 22.13 or newer, pnpm, Vinext, Cloudflare D1 (`DB`) and R2 (`BUCKET`).
The admin requires the server-side `VIARA_ADMIN_EMAIL` secret and platform
identity headers supplied by Sites. Configure secrets in the hosting environment.

GitHub stores source code. Production deployment remains managed by Sites; a
GitHub commit or merge does not automatically publish a Site version.
Future website changes should be copied into this folder and committed on a
branch before opening a pull request. Publish website changes separately through
the existing Sites project using its supported source and deployment workflow.

## Included data

Source, database migrations, bundled fonts, logos and illustrative photos are
included. Runtime secrets, live inquiries, reviews, database rows and uploaded R2
files are not part of this source snapshot. Generated compiler cache files and
build output are excluded. Applied migrations must remain unchanged.
