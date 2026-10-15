# Explore GhostReport cards

## Changes

- Redesigned the ENS and Install cards with equal-height 180px surfaces, more
  breathing room, 20px headings and readable 14px descriptions.
- Added restrained white/pale-blue backgrounds, larger corner radii, balanced
  icon tiles and circular arrow affordances at the right edge.
- Added border/shadow hover feedback, keyboard focus and reduced-motion support.
- Existing text, font family, icons, destinations and analytics behavior remain.
- Scoped styles live in `src/explore-cards.css`, imported by the clean landing
  entry file to avoid editing the concurrent HomePage/home.css changes.

## Validation

- `npm --prefix landing run build` passed (TypeScript + Vite).
- Reviewed localhost cards at 1280px and 1448px. Equal dimensions, no overflow
  and no browser errors; both ENS and Install links load their correct pages.
- Keyboard focus uses a visible 2px outline; reduced-motion transition is 0s.
- Refreshed only the landing static bundle in the local Docker image.
- No unit/E2E suites added or run. No dependencies or API changes. Other app
  builds, remote deployment, dark-mode and mobile review were outside scope.

## Scope and recovery

- Low-risk visual change. Applied UI-UX-Design / ui-ux-pro-max guidance for
  hierarchy, legibility, focus and stable interaction states; retained the chosen
  light theme and DAO fonts over generic search recommendations.
- Staged only the new card stylesheet, its entry import and this summary.
  Concurrent landing/header/console/backend work was excluded. No push.
- Recovery: revert these files, rebuild landing and refresh local static files.
  Rollback not rehearsed for this local visual change.
