# ENS publication review

## Finding and prepared changes

- Local GET /api/journeys/spec?project=ens returned HTTP 200 with draft=null,
  approved=null and comparison=null. Only journeys.ens.draft.json exists in the
  repository. The handoff explicitly requires operator approval before publication.
- Corrected draft version 2 prioritizes registration completion over commit-send
  and labels a send as a send. Preserved code refs and recorded editorial changes
  in revision_notes/revised_from. Updated the review document and digest.
- Proposed code-only graph now carries manual reference checks. A known wrong
  state's description is withheld in favour of its ID and a review badge;
  partial references are identified. No counts or ENS sessions are introduced.
- A browser-only draft preview rendered the graph and no generation controls.
  It was not a published API response or an approval record.

## Validation and pending action

- Draft schema/reference/vocabulary/ordering checks passed; console build,
  strict mypy and changed-file ruff/whitespace checks passed.
- No test suites added/run. No API response was marked approved automatically.
- Requested owner approval of digest
  596704bcf58ce8a5b4821198506633960101777ad730f75e1fee453c969a7f16,
  with attribution project owner (chat approval). Approval remains pending.
- After approval: create journeys.ens.json with the offline approval CLI, commit
  it and rebuild Docker with matching GIT_SHA; verify the live API and ENS page.
- Risk: Low for prepared changes; publication is gated by the explicit handoff
  human-approval requirement. Existing counts and report rules are untouched.
- Skills: agentic-workflow scope/commit rules; existing UI-UX-Design evidence
  clarity. Recovery: revert these preparation changes. No push or deploy yet.
