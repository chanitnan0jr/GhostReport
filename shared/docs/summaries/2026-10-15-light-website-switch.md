# Light website switch

- Redesigned only the GhostReport / DAO Mock switch as a light recessed track
  with a raised white selection, blue selected text and restrained shadows.
- Replaced dots with the supplied ghost logo and an inline DAO cube icon.
- Both options share their dimensions, typography and 44px link target.
- Added a scoped `site-switch.css` imported by the shared header so this change
  stays separate from concurrent primary-navigation edits in `header.css`.
- Retained semantic links/aria-current, focus outlines, pressed/hover feedback,
  reduced-motion support and the existing URL-derived selection.

Validation: landing, app and console TypeScript/Vite builds passed. Reviewed both
selection states on localhost at 1280px and the header at 1920px: equal-width
options, no overlapping regions, no horizontal overflow or page errors. DAO Mock
navigates directly to /app/. Keyboard focus is visible; reduced motion uses 0s
transitions. Refreshed local frontend static bundles in Docker.

Used ui-ux-pro-max for the design-system and navigation/accessibility guidance;
kept the existing DAO font stack and brand palette over generic search results.
No dependencies, API/tracking changes or unit/E2E suites added/run. Mobile and
dark mode were outside the existing desktop/light scope.

Low-risk shared UI change. Staged only SiteHeader, the new switch stylesheet,
README and this summary. Concurrent header.css, landing, console and backend work
was excluded. No push. Recovery: revert this module commit, rebuild consumers and
refresh local bundles; rollback not rehearsed.
