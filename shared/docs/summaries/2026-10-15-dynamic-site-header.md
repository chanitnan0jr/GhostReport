# One dynamic header for every frontend

Date: 2026-10-15 · Branch: main · Risk: Medium · Approval: user explicitly asked.

## Changes and scope

- Shared SiteHeader React component, menu/brand configuration, logo and CSS.
- Landing's SiteHeader re-exports the shared component; Shell renders its frame.
- App removes its copied navigation/header and renders the shared component.
- Console keeps its existing route hook and sticky/Segments classes, and delegates
  markup and navigation to the shared component. No other console work included.
- All consumers dedupe React and resolve shared React typings locally. No new deps.
- Selected menu follows pathname/hash and browser history. App is Try the App;
  fact links are Workflow Map; report section hashes are Report. Report tab links
  retain the current report query context, including sid/operator and filters. Brand/GitHub live in one configuration.
- Grant flow tracking/probes, report data and backend behavior are unchanged.
  The old DAO brand's list navigation is replaced by the requested global Home link.

## Verification

All three TypeScript/Vite builds passed. Browser review at 1280px checked landing,
app and report headers, active states on report hash changes, back navigation,
logo loading and report query preservation. Browser plugin unavailable; used
local Playwright/Brave. No unit/E2E suites added or run.

For localhost, built committed source in an isolated temporary snapshot with the
header changes overlaid. This keeps other agents' uncommitted console/engine
work out of the Docker update. Updated only the three frontend static outputs
in the existing local runtime image. Volumes, backend and roles data preserved.
The root Dockerfile already supports shared source; no deploy files edited.

## Skills, assumptions and remaining limits

Used existing agentic-workflow/frontend debugging guidance: inspected each
consumer, scoped patches, builds, rendered review, explicit module staging and
local commits. No design/image generation: reusing the approved header/artwork.
Menu values are product configuration in shared/navigation.ts, not an API-driven
CMS. The engine has no menu endpoint. No remote deploy, mobile check or dependency
audit. The local shared logo is bundled per app; the older public logo URL stays
available for the hero and compatibility.

## Recovery

Revert the shared and consumer commits together and rebuild all frontends.
Repository maintainer owns rollback; rollback not rehearsed. No push performed.
