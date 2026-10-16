# Browser tab branding

## Changes

- Set the document title to `GhostReport` in all eight HTML entry points across
  landing, app, and console.
- Use the existing ghost logo as the PNG favicon. App and console include a
  public copy so their icons work independently with their Vite base paths.
- Landing reuses its existing public ghost artwork for every entry point.
- No page content, navigation, tracking, or backend behaviour changed.

## Checks

- `npm run build --prefix app` passed.
- `npm run build --prefix console` passed.
- `npm run build --prefix landing` passed.
- Inspected all eight generated titles and favicon URLs. The app and console
  URLs resolve under `/app/` and `/report/` respectively.
- SHA-256 comparison shows all three built icons match the shared header logo.
- `git diff --check` passed. No tests or remote deployments were run.

## Delivery

Low risk. Changes are committed separately for app, console, and landing;
nothing was pushed. Rebuild/redeploy the frontends to update a Docker or Railway
instance. A browser may retain its old favicon until its tab/cache is refreshed.
Recovery is to revert the corresponding frontend commit and rebuild.

Skills: agentic-workflow and commit-convention; applied scoped staging, local
commits, source review, and a saved summary. Production checks were skipped
because deployment was outside this change.
