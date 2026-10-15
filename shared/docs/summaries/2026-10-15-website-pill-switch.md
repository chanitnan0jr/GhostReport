# Website pill switch

## Changes

- Replaced the central Try the App link with a two-option pill beside GitHub.
- GhostReport links to Home; DAO Mock links to the existing role assignment page.
- Current URL selects DAO Mock on `/try/` and `/app/`, GhostReport elsewhere.
- Preserved the ghost logo, report hash selection and report query handling.
- All three frontends consume the shared component; no consumer source edits.

## Validation

- Landing, app and console TypeScript/Vite builds passed.
- Reviewed localhost Home, Try, app, Segments and Install at 1280px.
- Active pills and navigation match each route; header columns do not overlap.
- Updated the local Docker frontend bundles. No backend or database changes.
- No test suites or dependency scans run; no dependencies changed.

## Scope and recovery

- Low risk: shared header, navigation configuration, CSS and documentation only.
- Used agentic-workflow scope discipline and local-only commits; no push.
- No remote deployment or mobile work; no new API assumptions.
- Recovery: revert this shared module change, rebuild all three consumers and
  refresh local static bundles. Rollback not rehearsed for this visual change.
