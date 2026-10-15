# Direct DAO entry

- Home's DAO links now open `/app/` directly.
- Legacy `/try/` redirects with the same query and hash before rendering React.
- The public entry no longer imports the introductory Try page or role card;
  existing historical role components/tests are outside the shipped entry.
- Updated the README to describe direct entry and flag old role browser checks
  as needing alignment. No new tests added or suites run.

Validation: landing TypeScript/Vite build passed; reviewed localhost at 1280px.
The legacy entry opens “A small start. A shared future.” with the original sid,
and makes no role request. Updated local Docker static files only; no remote
deployment, backend changes or report population writes.

Low risk; used agentic-workflow for scoped module commits. No push. Recovery is
a landing module revert and rebuild; rollback not rehearsed.
