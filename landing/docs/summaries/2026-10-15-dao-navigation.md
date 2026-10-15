# DAO homepage and public navigation

Date: 2026-10-15 · local frontend changes only

## User request

Make the mock DAO the homepage at `/`, with Header navigation to DAO,
Demo User Seed and Report. The user explicitly chose DAO as the root page.

## Implementation

- `/` now displays Common Ground DAO: a light community-grants homepage,
  existing project data, grant cards, accessible navigation and mobile layout.
- Selecting a program assigns a role, displays the original exact card, and
  enters `/app/?sid=...#/project/...`. The general Start flow still enters
  the project list. Only the session ID reaches the engine; roles remain
  outside API payloads and storage.
- `/about/` retains the GhostReport guide and integration instructions.
- `/seed/` displays only sessions whose server source is seed. It reads
  `/api/report` and `/api/seed-sessions/{session_id}` for the cohort,
  coverage, event sequence, server timestamps and optional response.
  This is a read-only viewer, not the deferred video-based `/demo` page.
- Local mock seed previews are labeled fixtures, not recorded browser runs.
  Empty runs, unavailable source metadata and API errors have visible states.
- Shared Header labels appear on the landing pages, app and console:
  DAO → `/`; Demo User Seed → `/seed/`; Report → `/report/`.
- About and Seed are separate Vite HTML entries for existing static hosting.
  ENS remains `/ens/`. The moved guide's existing browser-test URL was updated.

## Verification

- Production builds passed for app, console and landing, including TypeScript.
- Landing output includes index.html, about/index.html, seed/index.html,
  and ens/index.html.
- `git diff --check` passed. Credential-pattern scan found no matches.
- No unit or browser tests were added or run for this request.
  Responsive behavior is implemented in CSS and remains visually unverified.
- No engine, fixtures, roles, scripts or deployment files were changed.
- Concurrent Journey Flow work was excluded from the navigation commits.

## Local use

Start the three Vite servers and enter through http://localhost:5175/:

    npm --prefix app run dev
    npm --prefix console run dev
    npm --prefix landing run dev

For local fixture previews, set VITE_MOCK=1 for each server. Real mode uses
GHOST_API_TARGET and GHOST_ROLES_TARGET with the existing separate services.
The single-origin entry is needed for cross-app links and shared localStorage.

## Commits and handoff

App: 9e55de5. Console: 340fac8. Landing: this summary's commit.
No push or deployment was performed. To roll back, revert the corresponding
module commit. There is no database migration or new API field requirement.
Re-run engine build verification on the final deployment revision, since
verification is tied to the exact commit. The Friday-after-G2 video demo
remains deferred.

Skills applied: agentic-workflow for scoped changes and module commits;
UI-UX-Design for navigation, readable hierarchy, focus states and touch sizes.
