# Ink mountain Home redesign

Date: 2026-10-15 · Branch: main · Risk: Medium · Approval: user supplied reference.
Reference: /home/Sinu/Downloads/Landingpage.png. Explicit exception: keep ghost logo.

## Scope and changes

- Shared header adopts the floating glass frame, serif wordmark, centered menu,
  active underline and GitHub icon; ghost logo and dynamic navigation remain.
- Home uses a pale ink mountain backdrop, serif two-line headline, four horizontal
  process cards, demo before the featured DAO app, and two lower destination cards.
- Retained the previously requested full-size 460px recordings, Play all four,
  timed logs, source labels and segment results. Added per-recording play controls
  and descriptions to match the reference. No recorded content or event data changed.
- Kept the user's unframed white DAO artwork as a small featured-app mark.
- Featured image is captured from the real app's project-list intro. No fictional
  wallet, role, option label or app flow from the mockup was reproduced.
- API-derived population remains visible and source-separated in the featured app.
- Removed the replaced legacy Home CSS; separate home.css scopes the new layout.
  Other landing pages keep their existing content and player. Shared header is global.
- No app/console/engine source edits, tracking changes, APIs, dependency changes or
  deployment file edits. Other agents' uncommitted work was excluded from commits.

## Assets and prompt

- public/images/ink-mountains.png generated with built-in image_gen from the
  reference, removing all panels, UI, text and logos. Prompt requested pale cool
  monochrome ink-wash mountains on rice paper, mist, upper-right peak, empty
  upper-left copy area, forested foreground ridges, tiny pavilion and birds.
  Saved inside the workspace; no API key used. Decorative asset only.
- public/images/common-ground-preview.png is an unmodified browser capture of
  .intro in /app/?sid=e2e-landing-artwork, after Continue without feedback.
  It shows public project-list copy and contains no session/role information.
- Existing real recordings, posters, ghost and DAO artwork reused unchanged.

## Verification

- Landing normal and VITE_MOCK=1 TypeScript/Vite builds passed; final output normal.
- All frontend builds checked in an isolated committed-source snapshot plus these
  scoped changes. App/console also built from the shared working checkout for local
  preview, preserving the other frontend session's in-progress report UI. Those
  source changes were not staged or committed here.
- Local Playwright/Brave visual review; browser connector unavailable. Inspected
  reference and rendered screenshots with view_image at native 1448×1086 and
  1280×960. No horizontal overflow or page errors observed.
- Watch the demo scrolls to #demo. Individual play advances only its video;
  Play all four advances all clocks and timed logs. Videos remain 460px tall.
- Local Docker updated with scoped static frontend outputs, preserving runtime
  backend and volumes. Unit/E2E suites, dependency audit, mobile and remote deploy
  were not run. No database reset or visitor simulation performed.

## Fidelity ledger

| Area | Reference / implementation |
| --- | --- |
| Header | Floating glass card and underline; ghost retained instead of mountain logo |
| Typography | Dark navy serif headline/wordmark, blue emphasis, muted sans body |
| Hero | Left copy, right horizontal four-step cards with blue connectors |
| Background | Pale generated ink landscape, not an image of the UI |
| Order | Hero → simulated recordings → featured real app → two next links |
| Media | Actual recordings retained large, rather than compact fictional thumbnails |
| App preview | Screenshot of real DAO intro and user-provided logo, not fictional wallet UI |
| Data | API k-of-n population; original recordings and self-report labels |

Intentional deviations: the prior explicit large-demo requirement makes the page
longer than the compact reference; factual app media replace the mockup's invented
screens. Source labels, logs and simulation disclosure remain visible. No claim
of pixel-identical reproduction of the fabricated app screens.

## Skills, risks and recovery

Used existing frontend-app-builder, imagegen, frontend debugging and
agentic-workflow guidance. No new concept approval: user supplied the accepted
reference. Scoped edits, actual media, browser comparison, explicit module staging
and local commits. No push performed. Runtime playback/network remains browser-
dependent; visible errors are handled. Laptop-only scope, as previously requested.
Revert the shared style and landing commits together, rebuild, and refresh the
local containers to recover. Maintainer owns rollback; rollback not rehearsed.
