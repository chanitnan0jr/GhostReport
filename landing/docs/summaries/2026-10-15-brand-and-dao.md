# Landing brand and DAO illustration

Date: 2026-10-15 · Branch: main · Risk: Low · Approval: explicitly requested.

## Changes

- Replaced the header G tile with the user's exact ghost image, copied unchanged
  from /home/Sinu/Downloads/121202.png to public/images/ghostreport-mark.png.
  The link keeps the accessible GhostReport name; the image is decorative.
- Removed the DAO image border, rounded corners, shadow and background fill.
  The section keeps its existing layout and supplied DAO artwork.
- Scoped edits to landing SiteHeader, site.css, the asset and this report.
  Other agents' uncommitted console work was excluded.

## Verification

Landing TypeScript/Vite build and diff whitespace check passed. Local Docker
landing assets updated and api/proxy refreshed without a full backend rebuild.
Browser plugin unavailable: local Playwright/Brave used to inspect the header
image and flat DAO illustration at localhost. No unit/E2E suites run.
No dependencies, tracking, API, roles, database or deployment config changed.

## Skills, assumptions and recovery

Applied existing agentic-workflow/frontend debugging guidance: scoped edits,
visual review, explicit staging, local commit, no push. No image generation or
editing needed because both assets were supplied by the user. Mobile/remote
checks and dependency audit skipped for this small desktop styling change.
Revert this landing commit and rebuild to recover; rollback not rehearsed.
Repository maintainer owns rollback. No push performed.
