# Project selection and generated journey definitions

## Implemented

- Shared header: Workflow Map before Segments, Mock data / ENS data selector in
  place of the website pill, DAO Mock after Install, active underline on /app/.
  Project query follows navigation; ENS removes sandbox/operator context.
- ENS console: reads ENS workflow and definition endpoints only. No mock report,
  sessions, traffic controls or website generation/approval actions.
- New journey DSL, first-match evaluator, template regression anchor and checked
  LLM stage. Source refs are resolved from model-proposed node IDs by the engine.
  Validation rejects unknown events/refs, changed quotes, manual wrong refs,
  intent/count wording, invalid state columns, missing catch-all and provably
  unreachable rules. Absence-dependent evaluation requires complete coverage.
- GET /api/journeys/spec, operator POST generate/approve, digest-bound approval,
  workflow/context-scoped cache and JSONL history. Generated comparisons have
  engine-computed counts, source splits and template cohort cross-tabs.
- Console: original template beside generated definitions, data-driven graph
  with pan/zoom (initial 0.8), rule/evidence review and token-gated approval.
  Approval returns focus to the generated heading instead of leaving the user
  below the form that was removed.
- Sandbox: owner-only Generate journeys step, forwarding whitelist, shared AI
  quota/semaphore, free cache hits, concurrent mutation guards and reset cleanup.
  Reveal compares generator paths with actual event-based segment assignments;
  generator truth remains outside the model input and normal evidence.
- Report still uses the existing cohorts and locked v1; its document Appendix
  identifies the original template digest. Updated checked document fixture.
- ENS offline CLI plus a real validated LLM draft and review notes. The draft is
  not served or approved. See ../reviews/2026-10-16-ens-journeys.md.

## Decisions and scope

Owner decisions in the handoff override the older phase text about replacing
report cohorts: comparison only. Existing /api/journeys and report rules remain
unchanged. No app tracking/probe logic, role service or deployment config edited.
The app event vocabulary is the canonical vocabulary accepted by ingest. ENS
uses literal analytics calls in checked map quotes, and states that scope.
The existing template chart retains its fixed four cohorts; the new comparison
chart derives columns, nodes and edges from generated definitions.

## Verification

- Backend: 98 tests passed; mypy passed (30 modules). Changed Python files pass
  ruff. Global ruff still reports the nine documented pre-existing E501 findings.
- Vitest: console 38, landing 15, app 39 passed. All three production builds pass.
- Console/landing formatting and git whitespace checks pass.
- Projector Playwright: four tests passed, including ENS tab navigation, no mock
  session leakage and no ENS operator controls.
- Browser against an isolated real FastAPI process and a test LLM: generate,
  review, approve and graph render passed; 1280/1440px had no horizontal overflow,
  no page errors, and report.current plus locked v1 remained byte-equivalent.
- Real ENS LLM drafts with incorrect references were withheld. The final review
  draft passes validation and has no counts. Human semantic review remains.
- No new dependencies. No remote push or deployment.

## Risk, remaining action and recovery

- Medium scope: new authenticated generation and persistence, isolated from the
  report's existing classification. Existing authorization covers implementation,
  checks and local Docker rebuild; approving ENS requires the human review step
  specified in the handoff. No human approval identity was invented.
- ENS review notes flag first-match ordering and the commit-send label. Do not
  approve the draft merely because structural/reference validation passed.
- Skills: UI-UX-Design for navigation/keyboard/layout; agentic-workflow for scope,
  checks and module commits. Existing design tokens and DAO font retained.
- Clarification skipped: all four owner decisions were supplied. A broad mobile
  console redesign and fixes to pre-existing global ruff findings are out of scope.
- Recovery: revert the module commits and rebuild with a matching GIT_SHA.
  Existing report/event SQLite data is not migrated or reset; new journey files
  are separate. Rollback was not rehearsed on the judging run.
