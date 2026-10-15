# Hero loop brand update

Date: 2026-10-15 · Branch: main · Risk: Low · User explicitly requested.

Replaced the pale inline SVG in the center of the Home workflow loop with
/images/ghostreport-mark.png, the same user-supplied artwork as the header.
Preserved the decorative accessibility treatment and GhostReport label.
Changes are limited to landing HomePage.tsx, site.css and this report.

Verification: landing TypeScript/Vite build, whitespace check and local Docker
visual inspection. No unit/E2E suites run. Updated only landing assets in the
local Docker image, preserving the backend, other frontend builds and volumes.
Used existing scoped-edit/frontend debugging guidance; no new concepts, image
edits, dependencies or API changes. Remote/mobile checks skipped for this small
requested substitution. Revert the landing commit and rebuild to recover;
rollback not rehearsed. No push performed.
