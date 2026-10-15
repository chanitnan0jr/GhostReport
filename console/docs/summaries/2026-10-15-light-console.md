# Light console and session handoff

Date: 2026-10-15
Branch: main
Status: local implementation; no push or deploy
Risk: medium (presentation and read-only session navigation)
Approval: authorized by the redesign request and X5 clarification

## Scope

- Console: Segments, Workflow Map, Report; shared light tokens and nine-tab header.
- X5, implemented last: app finish bar, linking the tracker's exact session ID to Segments.
- Shared tokens, landing, engine, scripts, roles, fixtures, prompts and deploy files were not edited.
- Laptop scope stays at 1280 px and above; no mobile redesign.

## Changes

- Import `shared/tokens.css`; white surfaces, blue controls, readable dark text.
- Use shared header classes and the landing header's current `/try/` role-card route.
  Home remains `/`, owned by landing. Console navigation preserves the session query.
- Remove the fixed sidebar; report section links are horizontal. Graphs have the full
  content width. Instrumentation colours use found/gap/unknown tokens; segments use
  their three separate semantic colours. No people imagery.
- Keep numeric/label provenance from the APIs. v1 is Unresolved, with actual lock
  context. Current threshold labels are written as “Selected by at least half
  (self-report)” beside exact respondent counts; no backend rule changes.
- Narrative renders only the API text/source/facts. Recommendations and guarded
  wording are withheld. JSON numeric fields remain intact; string label formatting
  is disclosed. API errors remain visible in Segments and Workflow as well as Report.
- Poll `/api/journeys/session/<encoded sid>` alongside the graph. URL sid wins over
  localStorage. Highlight the exact returned nodes/edges and show `segment_label`.
  A 404 renders nothing extra. Source filters never display a path from a different
  source. Card highlighting and the personal path can be toggled independently.
- Mock mode supports the session endpoint from the existing report fixture, without
  inventing probe exposures or responses. These paths remain labelled as a preview.
- App finish bar appears after a connection or an exit, once the optional question
  is absent/answered/skipped/dismissed. It has no event handler or analytics call.
  Original tracking, exit sequence, wallet callbacks and probe eligibility are intact.

## Files

- `console/src/styles.css`, header/App, three graph styles/components, Segments,
  NarrativeSummary, ReportPanels, format, workflow palette, session hook, mock,
  useJudgeSession and README.
- App integration is a separate module commit: `app/src/App.tsx`,
  `SessionFinishBar.tsx` and `SessionFinishBar.css` only. App header was not edited.

## Verification

- Console: TypeScript and production build in normal and VITE_MOCK=1 modes.
- App: TypeScript and production build in normal and VITE_MOCK=1 modes.
- Diff whitespace check and a credential-pattern scan over our changed text files.
- No unit/browser tests, rendered screenshots, real API round trip or deployment
  were run in this iteration. Existing UI assertions were not revalidated.
- No dependencies changed. No new backend fields are needed; the session endpoint
  from 1ad8656 supplies this feature.
- New app code must be included in the backend owner's next commit-specific build
  verification; no claim is made that the previous verification covers this commit.

## Run

```sh
VITE_MOCK=1 npm --prefix console run dev
# http://localhost:5174/report/#segments
# Fixture example: http://localhost:5174/report/?sid=s1#segments
```

Without VITE_MOCK, dev proxies use GHOST_API_TARGET (default port 18000).
App finish links retain the same origin and point to `/report/?sid=<id>#segments`.

## Version control and recovery

Commits are separated by console and app modules, with explicit file paths. No push.
This document is included in the console redesign commit; the app follows separately.
Revert just those module commits to restore the prior UI, preserving other owners'
commits. Revert was not rehearsed; no backend data was written.

## Skills / skip log

- agentic-workflow: scope/ownership, read before edit, local conventional commits,
  diff review, no secrets and no push; saved handoff.
- UI-UX-Design: supplied design and shared palette take precedence over generating
  another palette; contrast, semantic colours, focus states and no avatars.
- Planning/clarification: X5 was confirmed before app work. No extra permissions.
- Post-deploy and rollback rehearsal skipped: no deploy or backend writes.
- Unit/browser testing skipped under the current instruction to run tests only
  when requested; builds remain the explicit compilation check.

Remaining assumption: endpoint snapshots can arrive at different times. Personal
highlight membership is never used to alter the aggregate graph or its counts.
