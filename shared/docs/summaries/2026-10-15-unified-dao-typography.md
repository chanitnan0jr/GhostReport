# Unified DAO typography

## Summary

- Shared UI font: the DAO Mock stack, `"DM Sans", "Segoe UI", Arial, sans-serif`.
- App headings/project labels, the shared wordmark, landing headings and report
  summary now use that same family. Primary headings use weight 500; secondary
  headings generally use 600 for a simpler visual hierarchy.
- Code snippets, event IDs and technical references retain the monospace token.
- No remote fonts, dependencies, API changes or tracking changes introduced.
  As before, browsers use an installed fallback if DM Sans is unavailable.

## Scope and module commits

- `app/src/styles.css`: ea6ce72.
- Landing styles and README: e02b6f6.
- `console/src/main.tsx` and new `typography.css`: 4f0df64.
- Shared token, header styling and documentation: this commit.
- Concurrent console implementation and engine/test changes were not staged.

## Validation

- TypeScript/Vite builds passed for landing, app and console.
- Reviewed localhost at 1280px: Home, DAO entry, Report, Segments, Workflow Map,
  Demo, ENS, Install and About. Computed body, wordmark and heading font families
  match on every page; the report summary uses the same stack.
- No page overflow or browser errors observed. Existing video size retained.
- Updated local Docker frontend static bundles; no database writes or remote
  deployment. No unit/E2E suites added or run; no dependency scan needed because
  dependencies did not change. Mobile review skipped per desktop-only scope.

## Risk, skills and recovery

- Low risk; requested typography changes are reversible CSS edits.
- Used agentic-workflow for scoped module commits and UI-UX-Design for typography
  hierarchy, readable text and shared tokens. No push.
- Recover by reverting these module commits, rebuilding consumers and refreshing
  local static bundles. Rollback not rehearsed for this local visual change.
